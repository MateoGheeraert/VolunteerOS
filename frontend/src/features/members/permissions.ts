import type { OrgRole } from '@/server/auth';

/** Roles an admin can hand out. Must match ASSIGNABLE_ORG_ROLES in backend/src/auth/auth.membership.ts. */
export const ASSIGNABLE_ROLES = ['admin', 'member'] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export const isOrgAdmin = (role: OrgRole) => role === 'owner' || role === 'admin';

/**
 * Whether the UI offers role and remove controls for `target`. Mirrors what the backend (Better
 * Auth) enforces, so the controls shown are the ones that work:
 * - only owners and admins manage members; admins are peers, also towards themselves;
 * - only an owner touches another owner;
 * - the last owner is never demoted or removed.
 */
export function canManageMember(
  actor: { role: OrgRole },
  target: { role: OrgRole },
  ownerCount: number,
): boolean {
  if (!isOrgAdmin(actor.role)) return false;
  if (target.role !== 'owner') return true;
  return actor.role === 'owner' && ownerCount > 1;
}

/** An invitation past its expiry date can't be accepted anymore, but can be resent. */
export const isExpired = (invitation: { expiresAt: Date }, now = new Date()) =>
  invitation.expiresAt.getTime() <= now.getTime();
