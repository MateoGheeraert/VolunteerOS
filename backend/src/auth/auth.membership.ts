import { Logger } from '@nestjs/common';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { and, eq, inArray, ne } from 'drizzle-orm';
import { recordActivity } from '../activity/activity-log.js';
import type { Actor } from '../activity/actor.js';
import type { Database, DbExecutor } from '../db/database.js';
import {
  emailDelivery,
  event,
  eventMember,
  invitation,
  task,
  taskAssignmentRequest,
} from '../db/schema/index.js';
import { notDeleted } from '../db/soft-delete.js';
import type { OrgRole } from '../authz/policies.js';
import type { AuthHookContext } from './auth.account.js';
import { currentActor } from './auth.activity.js';

/**
 * The roles an invitation can hand out. `owner` is never given by invitation: an owner promotes
 * an existing member instead (see ROLE_CHANGE_ORG_ROLES).
 */
export const ASSIGNABLE_ORG_ROLES = ['admin', 'member'] as const satisfies readonly OrgRole[];

/**
 * The roles a member's role can be changed to. Better Auth itself guards `owner`: only an owner
 * may make someone owner or change another owner's role, and the last owner can't step down.
 * An organization may have several owners; promoting someone else keeps you owner.
 */
export const ROLE_CHANGE_ORG_ROLES = [
  'owner',
  ...ASSIGNABLE_ORG_ROLES,
] as const satisfies readonly OrgRole[];

export function assertAssignableRole(
  role: string,
  allowed: readonly OrgRole[] = ASSIGNABLE_ORG_ROLES,
): void {
  if (!(allowed as readonly string[]).includes(role)) {
    throw new APIError('BAD_REQUEST', {
      code: 'ROLE_NOT_ASSIGNABLE',
      message: `Role must be one of: ${allowed.join(', ')}`,
    });
  }
}

/**
 * Rejects `invite-member` with `resend: true`. Better Auth then re-sends the same invitation
 * without running any hook, so the activity log would miss it. Resending is inviting again:
 * `cancelPendingInvitationsOnReInvite` cancels the old invitation and issues a new link.
 */
export const rejectInvitationResendFlag = createAuthMiddleware(async (ctx) => {
  if (ctx.path === '/organization/invite-member' && ctx.body?.resend) {
    throw new APIError('BAD_REQUEST', {
      code: 'RESEND_NOT_SUPPORTED',
      message: 'Invite the same email again to resend an invitation',
    });
  }
});

/**
 * Fails `invite-member` when the invitation email was not sent, and cancels the invitation.
 *
 * Better Auth stores the invitation, then calls `sendInvitationEmail` and only logs what it
 * throws, so the request would succeed with an invitation nobody received. This after-hook
 * checks the delivery log instead: anything but `sent` (a failed send, or one that threw before
 * it was logged) cancels the invitation and answers 502, so the organizer knows to try again.
 */
export function failInvitationWithoutEmail(db: Database) {
  return async (ctx: AuthHookContext): Promise<void> => {
    if (ctx.path !== '/organization/invite-member') return;
    const returned: unknown = ctx.context.returned;
    if (!returned || returned instanceof Error || typeof returned !== 'object') return;
    if (!('id' in returned) || typeof returned.id !== 'string') return;
    const invitationId = returned.id;

    const [delivery] = await db
      .select({ status: emailDelivery.status })
      .from(emailDelivery)
      .where(eq(emailDelivery.idempotencyKey, invitationEmailKey(invitationId)));
    if (delivery?.status === 'sent') return;

    const [cancelled] = await db
      .update(invitation)
      .set({ status: 'canceled' })
      .where(eq(invitation.id, invitationId))
      .returning();
    if (cancelled) {
      await recordActivity(
        db,
        { organizationId: cancelled.organizationId, actor: currentActor() },
        { action: 'cancelled', entityType: 'invitation', entity: cancelled },
      );
    }
    throw new APIError('BAD_GATEWAY', {
      code: 'INVITATION_EMAIL_FAILED',
      message: 'The invitation email could not be sent; the invitation was cancelled',
    });
  };
}

/** The idempotency key of an invitation's email: one email per invitation id. */
export function invitationEmailKey(invitationId: string): string {
  return `organization-invitation:${invitationId}`;
}

/**
 * What follows every end of a membership, whether an admin removed the member (Better Auth's
 * `afterRemoveMember`) or the member deleted their account (features/account, inside its
 * transaction): their event assignments end and their open tasks are released.
 *
 * `actor` defaults to the signed-in user of the current Better Auth request.
 */
export async function endMembership(
  db: DbExecutor,
  organizationId: string,
  userId: string,
  actor: Actor = currentActor(),
): Promise<void> {
  await endEventAssignments(db, organizationId, userId, actor);
  await releaseOpenTasks(db, organizationId, userId, actor);
}

/**
 * Ends a removed member's event assignments, so no stale manager rows outlive their membership.
 *
 * Runs after Better Auth removed the member, outside its write. Unlike activity logging, a
 * failure here is not swallowed: the request fails, so the stale assignments get noticed.
 * Removing the member again is not possible, but an admin can unassign them per event.
 */
export async function endEventAssignments(
  db: DbExecutor,
  organizationId: string,
  userId: string,
  actor: Actor = currentActor(),
): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      const organizationEvents = tx
        .select({ id: event.id })
        .from(event)
        .where(eq(event.organizationId, organizationId));
      const ended = await tx
        .update(eventMember)
        .set({ deletedAt: new Date() })
        .where(
          and(
            eq(eventMember.userId, userId),
            notDeleted(eventMember),
            inArray(eventMember.eventId, organizationEvents),
          ),
        )
        .returning();
      for (const assignment of ended) {
        await recordActivity(
          tx,
          { organizationId, actor },
          {
            action: 'member_removed',
            entityType: 'event_member',
            entity: assignment,
            eventId: assignment.eventId,
          },
        );
      }
    });
  } catch (error) {
    new Logger('Membership').error(
      `Could not end event assignments of ${userId} in ${organizationId}`,
      error instanceof Error ? error.stack : String(error),
    );
    throw error;
  }
}

/**
 * Releases a removed member's unfinished tasks in the organization, so they show up as
 * unassigned again, and cancels their open requests. Done tasks keep them as assignee: that's
 * history, and the task shows they are no longer active. Archived events aren't touched.
 *
 * Runs after Better Auth removed the member, like endEventAssignments, and fails the same way.
 */
export async function releaseOpenTasks(
  db: DbExecutor,
  organizationId: string,
  userId: string,
  actor: Actor = currentActor(),
): Promise<void> {
  const scope = () => ({ organizationId, actor });
  try {
    await db.transaction(async (tx) => {
      // Archived events are read-only, their tasks included: those keep their assignee.
      const organizationEvents = tx
        .select({ id: event.id })
        .from(event)
        .where(
          and(
            eq(event.organizationId, organizationId),
            notDeleted(event),
            ne(event.status, 'archived'),
          ),
        );
      const released = await tx
        .update(task)
        .set({ assigneeUserId: null })
        .where(
          and(
            eq(task.assigneeUserId, userId),
            ne(task.status, 'done'),
            notDeleted(task),
            inArray(task.eventId, organizationEvents),
          ),
        )
        .returning();
      for (const row of released) {
        await recordActivity(tx, scope(), {
          action: 'updated',
          entityType: 'task',
          entity: row,
          before: { ...row, assigneeUserId: userId },
          eventId: row.eventId,
          values: ['assigneeUserId'],
        });
      }

      const requests = await tx
        .select({ request: taskAssignmentRequest, eventId: task.eventId })
        .from(taskAssignmentRequest)
        .innerJoin(task, eq(task.id, taskAssignmentRequest.taskId))
        .where(
          and(
            eq(taskAssignmentRequest.userId, userId),
            eq(taskAssignmentRequest.status, 'pending'),
            notDeleted(taskAssignmentRequest),
            inArray(task.eventId, organizationEvents),
          ),
        );
      for (const { request, eventId } of requests) {
        const [cancelled] = await tx
          .update(taskAssignmentRequest)
          .set({ status: 'cancelled' })
          .where(eq(taskAssignmentRequest.id, request.id))
          .returning();
        await recordActivity(tx, scope(), {
          action: 'cancelled',
          entityType: 'task_assignment_request',
          entity: cancelled!,
          before: request,
          eventId,
          values: ['taskId', 'userId', 'status'],
        });
      }
    });
  } catch (error) {
    new Logger('Membership').error(
      `Could not release open tasks of ${userId} in ${organizationId}`,
      error instanceof Error ? error.stack : String(error),
    );
    throw error;
  }
}
