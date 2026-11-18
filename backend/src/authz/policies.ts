import type { EventMemberRole } from '../db/schema/index.js';

/** Organization roles, as stored by Better Auth's organization plugin. */
export type OrgRole = 'owner' | 'admin' | 'member';

export type EventAction = 'read' | 'manage' | 'manageMembers';

export const isOrgAdmin = (role: OrgRole) => role === 'owner' || role === 'admin';

export interface EventAccessSubject {
  orgRole: OrgRole;
  /** The caller's role on this event, or null when they are not assigned to it. */
  eventRole: EventMemberRole | null;
}

/**
 * Who may do what with an event the caller's organization owns.
 * - Every member of the organization reads every event: small committees work together.
 * - Organization admins and owners: everything.
 * - Members: manage the events they are assigned to as manager.
 * - Only admins assign managers.
 */
export function canAccessEvent({ orgRole, eventRole }: EventAccessSubject, action: EventAction) {
  if (action === 'read' || isOrgAdmin(orgRole)) {
    return true;
  }
  if (action === 'manageMembers') {
    return false;
  }
  return eventRole === 'manager';
}

export function toOrgRole(role: string): OrgRole {
  // Better Auth stores multiple roles as a comma-separated string.
  const roles = role.split(',').map((r) => r.trim());
  if (roles.includes('owner')) return 'owner';
  if (roles.includes('admin')) return 'admin';
  return 'member';
}
