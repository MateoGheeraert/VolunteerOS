import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, eq, inArray, isNull, like, or, sql } from 'drizzle-orm';
import type { Database, DbExecutor } from '../../db/database.js';
import {
  account,
  emailDelivery,
  event,
  invitation,
  member,
  organization,
  session,
  user,
  userProfile,
  verification,
} from '../../db/schema/index.js';
import { notDeleted } from '../../db/soft-delete.js';
import { INVITATION_SUBJECT_AFTER_INVITER } from '../../email/templates/organization-invitation.js';
import { invitationEmailKey } from '../../auth/auth.membership.js';
import type { MembershipFacts } from './account-deletion-rules.js';

/** Data access for deleting (anonymizing) an account. Writes take the transaction they run in. */
@Injectable()
export class AccountRepository {
  constructor(@InjectDrizzle() private readonly db: Database) {}

  /** The user as deletion needs them; `forUpdate` locks the row against a concurrent deletion. */
  async findUser(userId: string, db: DbExecutor = this.db, { forUpdate = false } = {}) {
    const query = db
      .select({ id: user.id, name: user.name, email: user.email, deletedAt: user.deletedAt })
      .from(user)
      .where(eq(user.id, userId));
    const [row] = await (forUpdate ? query.for('update') : query);
    return row ?? null;
  }

  /** The hash of the user's email-and-password credential, if they have one. */
  async passwordHash(userId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ password: account.password })
      .from(account)
      .where(and(eq(account.userId, userId), eq(account.providerId, 'credential')));
    return row?.password ?? null;
  }

  /** Every membership of the user in an organization that isn't deleted, with its counts. */
  async memberships(userId: string, db: DbExecutor = this.db): Promise<MembershipFacts[]> {
    // Better Auth stores several roles comma-separated (see toOrgRole).
    const counts = (role?: 'owner') =>
      sql<number>`(select count(*)::int from ${member} as other_member
        where other_member.organization_id = ${member.organizationId}
        ${role ? sql`and other_member.role ~ '(^|,)\\s*owner\\s*(,|$)'` : sql``})`;
    return db
      .select({
        organizationId: member.organizationId,
        organizationName: organization.name,
        role: member.role,
        memberCount: counts(),
        ownerCount: counts('owner'),
        eventCount: sql<number>`(select count(*)::int from ${event}
          where ${event.organizationId} = ${member.organizationId} and ${event.deletedAt} is null)`,
      })
      .from(member)
      .innerJoin(organization, eq(organization.id, member.organizationId))
      .where(and(eq(member.userId, userId), isNull(organization.deletedAt)))
      .orderBy(organization.name);
  }

  /** Locks the members of these organizations, so roles can't change while the check runs. */
  async lockMembers(tx: DbExecutor, organizationIds: string[]): Promise<void> {
    if (organizationIds.length === 0) return;
    await tx
      .select({ id: member.id })
      .from(member)
      .where(inArray(member.organizationId, organizationIds))
      .for('update');
  }

  async deleteMembership(tx: DbExecutor, userId: string, organizationId: string) {
    const [removed] = await tx
      .delete(member)
      .where(and(eq(member.userId, userId), eq(member.organizationId, organizationId)))
      .returning();
    return removed ?? null;
  }

  /** Soft-deletes the organization and frees its slug. */
  async deleteOrganization(tx: DbExecutor, organizationId: string, slug: string) {
    const [deleted] = await tx
      .update(organization)
      .set({ deletedAt: new Date(), slug })
      .where(and(eq(organization.id, organizationId), notDeleted(organization)))
      .returning();
    return deleted ?? null;
  }

  async cancelPendingInvitationsOf(tx: DbExecutor, organizationId: string) {
    return tx
      .update(invitation)
      .set({ status: 'canceled' })
      .where(and(eq(invitation.organizationId, organizationId), eq(invitation.status, 'pending')))
      .returning();
  }

  /**
   * Every invitation ever sent to the address gets the replacement address instead; the pending
   * ones are cancelled as well. Returns the cancelled ones.
   */
  async scrubInvitationsTo(tx: DbExecutor, email: string, replacement: string) {
    const addressedToUser = sql`lower(${invitation.email}) = lower(${email})`;
    const cancelled = await tx
      .update(invitation)
      .set({ status: 'canceled', email: replacement })
      .where(and(addressedToUser, eq(invitation.status, 'pending')))
      .returning();
    await tx.update(invitation).set({ email: replacement }).where(addressedToUser);
    return cancelled;
  }

  /**
   * Removes the user's address from the delivery log: rows sent to it, and the security notices
   * keyed by the user's id (which also went to earlier addresses). A copy of the address in a
   * provider error is replaced too.
   */
  async scrubDeliveries(tx: DbExecutor, userId: string, email: string, replacement: string) {
    await tx
      .update(emailDelivery)
      .set({
        recipient: replacement,
        lastError: sql`replace(${emailDelivery.lastError}, ${email}, ${replacement})`,
      })
      .where(
        or(
          sql`lower(${emailDelivery.recipient}) = lower(${email})`,
          like(emailDelivery.idempotencyKey, `email-changed:${userId}:%`),
          like(emailDelivery.idempotencyKey, `password-changed:${userId}:%`),
        ),
      );
  }

  /** The recipient of one delivery (the goodbye email) becomes the replacement address. */
  async scrubDeliveryRecipient(idempotencyKey: string, replacement: string) {
    await this.db
      .update(emailDelivery)
      .set({ recipient: replacement })
      .where(eq(emailDelivery.idempotencyKey, idempotencyKey));
  }

  /**
   * Invitation subjects start with the inviter's name: in the invitations the user sent, the
   * name is replaced by `replacementName`.
   */
  async scrubInviterName(tx: DbExecutor, userId: string, replacementName: string) {
    const sentByUser = tx
      .select({ key: sql`${invitationEmailKey('')} || ${invitation.id}` })
      .from(invitation)
      .where(eq(invitation.inviterId, userId));
    const after = sql`position(${INVITATION_SUBJECT_AFTER_INVITER} in ${emailDelivery.subject})`;
    await tx
      .update(emailDelivery)
      .set({
        subject: sql`${replacementName} || substring(${emailDelivery.subject} from ${after})`,
      })
      .where(and(inArray(emailDelivery.idempotencyKey, sentByUser), sql`${after} > 0`));
  }

  /** Sessions, credentials, pending tokens and the profile: nothing to sign in with remains. */
  async deleteCredentialsAndProfile(tx: DbExecutor, userId: string) {
    await tx.delete(session).where(eq(session.userId, userId));
    await tx.delete(account).where(eq(account.userId, userId));
    // Password reset tokens store the user id as their value.
    await tx.delete(verification).where(eq(verification.value, userId));
    await tx.delete(userProfile).where(eq(userProfile.userId, userId));
  }

  async anonymizeUser(tx: DbExecutor, userId: string, values: { name: string; email: string }) {
    await tx
      .update(user)
      .set({ ...values, image: null, emailVerified: false, deletedAt: new Date() })
      .where(eq(user.id, userId));
  }
}
