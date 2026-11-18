import { APIError } from 'better-auth/api';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import type { Database } from '../db/database.js';
import { organization, user } from '../db/schema/index.js';
import type { AuthHookContext } from './auth.account.js';

/**
 * Keeps deleted accounts and organizations (features/account) out of Better Auth. A deleted
 * account has no credentials or sessions left, and a deleted organization no members or pending
 * invitations, so these are a second line of defence: they hold even if a row is ever re-added.
 */

/** Whether the user's account was deleted. */
export async function isUserDeleted(db: Database, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.id, userId), isNotNull(user.deletedAt)));
  return row !== undefined;
}

/** Refuses to let anyone join or be invited to a deleted organization. */
export async function assertOrganizationNotDeleted(
  db: Database,
  organizationId: string,
): Promise<void> {
  const [row] = await db
    .select({ id: organization.id })
    .from(organization)
    .where(and(eq(organization.id, organizationId), isNotNull(organization.deletedAt)));
  if (row) {
    throw new APIError('BAD_REQUEST', {
      code: 'ORGANIZATION_NOT_FOUND',
      message: 'Organization not found',
    });
  }
}

/**
 * For `hooks.after`: drops deleted organizations from `/organization/list`. Returns the
 * filtered list to replace the response, or undefined to leave it as it is.
 */
export async function hideDeletedOrganizations(
  db: Database,
  ctx: AuthHookContext,
): Promise<unknown[] | undefined> {
  if (ctx.path !== '/organization/list') return undefined;
  const returned: unknown = ctx.context.returned;
  if (!Array.isArray(returned) || returned.length === 0) return undefined;
  const ids = returned.flatMap((org: unknown) =>
    org && typeof org === 'object' && 'id' in org && typeof org.id === 'string' ? [org.id] : [],
  );
  const deleted = await db
    .select({ id: organization.id })
    .from(organization)
    .where(and(inArray(organization.id, ids), isNotNull(organization.deletedAt)));
  if (deleted.length === 0) return undefined;
  const deletedIds = new Set(deleted.map((row) => row.id));
  return returned.filter(
    (org: unknown) =>
      !(org && typeof org === 'object' && 'id' in org && deletedIds.has(org.id as string)),
  );
}
