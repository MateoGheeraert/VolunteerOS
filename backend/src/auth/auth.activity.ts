import { tryGetCurrentAuthEndpointContext } from '@better-auth/core/context';
import { Logger } from '@nestjs/common';
import type { OrganizationOptions } from 'better-auth/plugins';
import { eq } from 'drizzle-orm';
import { recordActivity, type ActivityInput } from '../activity/activity-log.js';
import { SYSTEM_ACTOR, userActor, type Actor } from '../activity/actor.js';
import type { Database } from '../db/database.js';
import { organization } from '../db/schema/index.js';

type OrganizationRow = typeof organization.$inferSelect;

// Fields whose values the log keeps. Everything else is stored by name only: notably the
// invitee's email (personal data, possibly of someone without an account) and the logo.
const ORGANIZATION_LOGGED_VALUES = ['name', 'slug'] as const;
const MEMBER_LOGGED_VALUES = ['userId', 'role'] as const;
const INVITATION_LOGGED_VALUES = ['role', 'status', 'expiresAt', 'inviterId'] as const;

/**
 * Logs Better Auth's organization changes (members, roles, invitations, settings).
 *
 * These hooks run after Better Auth has committed its own write, outside any transaction of ours,
 * so they can't be atomic with the change. If logging fails, the error is logged and the request
 * still succeeds: the change already happened, and failing the response would only hide that.
 *
 * The hook payloads name the user acted *on*; the actor is the session of the current request.
 */
export function organizationActivityHooks(
  db: Database,
): NonNullable<OrganizationOptions['organizationHooks']> {
  const logger = new Logger('ActivityLog');
  // The organization as it was before an update, per request, to diff against afterwards.
  const beforeUpdate = new WeakMap<object, OrganizationRow>();

  const record = async <Row extends { id: string }>(
    organizationId: string,
    input: ActivityInput<Row>,
  ) => {
    try {
      await recordActivity(db, { organizationId, actor: currentActor() }, input);
    } catch (error) {
      logError(`Could not record ${input.action} ${input.entityType} in ${organizationId}`, error);
    }
  };
  const logError = (message: string, error: unknown) =>
    logger.error(message, error instanceof Error ? error.stack : String(error));

  return {
    afterCreateOrganization: async ({ organization: org, member: owner }) => {
      await record(org.id, {
        action: 'created',
        entityType: 'organization',
        entity: org,
        before: null,
        values: ORGANIZATION_LOGGED_VALUES,
      });
      await record(org.id, {
        action: 'member_added',
        entityType: 'member',
        entity: owner,
        before: null,
        values: MEMBER_LOGGED_VALUES,
      });
    },
    // Runs before Better Auth's write: it must never throw, or it would block the update.
    beforeUpdateOrganization: async ({ member: actingMember }) => {
      try {
        const ctx = tryGetCurrentAuthEndpointContext();
        const [current] = await db
          .select()
          .from(organization)
          .where(eq(organization.id, actingMember.organizationId));
        if (ctx && current) beforeUpdate.set(ctx, current);
      } catch (error) {
        logError(`Could not load ${actingMember.organizationId} before its update`, error);
      }
    },
    afterUpdateOrganization: async ({ organization: org }) => {
      const ctx = tryGetCurrentAuthEndpointContext();
      const before = ctx ? beforeUpdate.get(ctx) : undefined;
      if (!org || !before) return;
      await record(org.id, {
        action: 'updated',
        entityType: 'organization',
        entity: org,
        before,
        values: ORGANIZATION_LOGGED_VALUES,
      });
    },
    afterAddMember: async ({ member: added }) => {
      await record(added.organizationId, {
        action: 'member_added',
        entityType: 'member',
        entity: added,
        before: null,
        values: MEMBER_LOGGED_VALUES,
      });
    },
    afterRemoveMember: async ({ member: removed }) => {
      await record(removed.organizationId, {
        action: 'member_removed',
        entityType: 'member',
        entity: removed,
      });
    },
    afterUpdateMemberRole: async ({ member: updated, previousRole }) => {
      await record(updated.organizationId, {
        action: 'role_changed',
        entityType: 'member',
        entity: updated,
        before: { ...updated, role: previousRole },
        values: MEMBER_LOGGED_VALUES,
      });
    },
    afterCreateInvitation: async ({ invitation: created }) => {
      await record(created.organizationId, {
        action: 'invited',
        entityType: 'invitation',
        entity: created,
        before: null,
        values: INVITATION_LOGGED_VALUES,
      });
    },
    afterAcceptInvitation: async ({ invitation: accepted, member: added }) => {
      await record(accepted.organizationId, {
        action: 'accepted',
        entityType: 'invitation',
        entity: accepted,
      });
      await record(added.organizationId, {
        action: 'member_added',
        entityType: 'member',
        entity: added,
        before: null,
        values: MEMBER_LOGGED_VALUES,
      });
    },
    afterRejectInvitation: async ({ invitation: rejected }) => {
      await record(rejected.organizationId, {
        action: 'rejected',
        entityType: 'invitation',
        entity: rejected,
      });
    },
    afterCancelInvitation: async ({ invitation: cancelled }) => {
      await record(cancelled.organizationId, {
        action: 'cancelled',
        entityType: 'invitation',
        entity: cancelled,
      });
    },
  };
}

/** The signed-in user of the current Better Auth request, or the system outside a request. */
function currentActor(): Actor {
  const userId = tryGetCurrentAuthEndpointContext()?.context.session?.user.id;
  return userId ? userActor(userId) : SYSTEM_ACTOR;
}
