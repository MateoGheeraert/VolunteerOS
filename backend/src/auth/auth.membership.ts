import { Logger } from '@nestjs/common';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { and, eq, inArray } from 'drizzle-orm';
import { recordActivity } from '../activity/activity-log.js';
import type { Database } from '../db/database.js';
import { event, eventMember } from '../db/schema/index.js';
import { notDeleted } from '../db/soft-delete.js';
import type { OrgRole } from '../authz/policies.js';
import { currentActor } from './auth.activity.js';

/**
 * The roles an admin can hand out, by invitation or role change. `owner` belongs to whoever
 * created the organization; transferring it is not supported yet.
 */
export const ASSIGNABLE_ORG_ROLES = ['admin', 'member'] as const satisfies readonly OrgRole[];

export function assertAssignableRole(role: string): void {
  if (!(ASSIGNABLE_ORG_ROLES as readonly string[]).includes(role)) {
    throw new APIError('BAD_REQUEST', {
      code: 'ROLE_NOT_ASSIGNABLE',
      message: `Role must be one of: ${ASSIGNABLE_ORG_ROLES.join(', ')}`,
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
 * Ends a removed member's event assignments, so no stale manager rows outlive their membership.
 *
 * Runs after Better Auth removed the member, outside its write. Unlike activity logging, a
 * failure here is not swallowed: the request fails, so the stale assignments get noticed.
 * Removing the member again is not possible, but an admin can unassign them per event.
 */
export async function endEventAssignments(
  db: Database,
  organizationId: string,
  userId: string,
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
          { organizationId, actor: currentActor() },
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
