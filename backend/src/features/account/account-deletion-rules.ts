import { toOrgRole } from '../../authz/policies.js';

/** The name a deleted account keeps, where tasks and history still show the user. */
export const DELETED_USER_NAME = 'Verwijderde gebruiker';

/**
 * The address a deleted account keeps. Unique per user (the column is unique), never deliverable
 * (`.invalid` is reserved, RFC 2606), and it frees the real address for a new sign-up.
 */
export const deletedUserEmail = (userId: string) => `deleted-${userId}@invalid`;

/** The slug a deleted organization keeps, so its own slug can be used again. */
export const deletedOrganizationSlug = (organizationId: string) => `deleted-${organizationId}`;

/** One of the user's memberships, with what deleting the account needs to know about it. */
export interface MembershipFacts {
  organizationId: string;
  organizationName: string;
  /** Better Auth's role string; may hold several roles, comma-separated. */
  role: string;
  memberCount: number;
  ownerCount: number;
  eventCount: number;
}

export interface DeletionAssessment {
  /** Only owner while others are members: these block the deletion. */
  blocking: MembershipFacts[];
  /** The user is the only member: these are deleted with the account. */
  toDelete: MembershipFacts[];
}

/**
 * Whether the account may be deleted. An organization must never be left with members but no
 * owner, so a sole owner first makes someone else owner (an admin is not enough). An
 * organization without other members goes with the account.
 */
export function assessDeletion(memberships: MembershipFacts[]): DeletionAssessment {
  const blocking: MembershipFacts[] = [];
  const toDelete: MembershipFacts[] = [];
  for (const membership of memberships) {
    if (membership.memberCount <= 1) {
      toDelete.push(membership);
    } else if (toOrgRole(membership.role) === 'owner' && membership.ownerCount <= 1) {
      blocking.push(membership);
    }
  }
  return { blocking, toDelete };
}
