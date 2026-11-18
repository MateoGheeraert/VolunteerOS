import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { accountScope, recordActivity } from '../../activity/activity-log.js';
import { userActor } from '../../activity/actor.js';
import { AUTH, type Auth } from '../../auth/auth.js';
import { endMembership } from '../../auth/auth.membership.js';
import type { Database, Transaction } from '../../db/database.js';
import { EmailService } from '../../email/email.service.js';
import {
  assessDeletion,
  DELETED_USER_NAME,
  deletedOrganizationSlug,
  deletedUserEmail,
  type DeletionAssessment,
} from './account-deletion-rules.js';
import { AccountRepository } from './account.repository.js';
import type { DeleteAccountInput, DeletionCheckDto } from './account.schemas.js';

/** The 409 answer when the deletion is blocked; the check endpoint says by which organizations. */
export const DELETION_BLOCKED_MESSAGE =
  'Make someone else owner of every organization you are the only owner of first';

/**
 * Deleting your own account. Nothing is hard-deleted: the user row stays, because tasks and the
 * activity log refer to it, but everything personal goes. In one transaction:
 * - every membership ends the way a removal does (event assignments end, open tasks are
 *   released), logged as `member_left` in that organization;
 * - organizations where the user was the only member are soft-deleted, with their invitations;
 * - invitations to the user's address are cancelled and every copy of the address in them and in
 *   the delivery log is replaced;
 * - sessions, credentials, tokens and the profile are deleted, and the user row is anonymized.
 * Then a goodbye email goes to the address the account had.
 */
@Injectable()
export class AccountService {
  private readonly logger = new Logger('Account');

  constructor(
    @InjectDrizzle() private readonly db: Database,
    @Inject(AUTH) private readonly auth: Auth,
    private readonly accounts: AccountRepository,
    private readonly email: EmailService,
  ) {}

  async check(userId: string): Promise<DeletionCheckDto> {
    return toDeletionCheckDto(assessDeletion(await this.accounts.memberships(userId)));
  }

  async delete(userId: string, input: DeleteAccountInput): Promise<void> {
    await this.verifyPassword(userId, input.password);

    const deleted = await this.db.transaction(async (tx) => {
      const current = await this.accounts.findUser(userId, tx, { forUpdate: true });
      if (!current || current.deletedAt) throw new NotFoundException();

      const unlocked = await this.accounts.memberships(userId, tx);
      await this.accounts.lockMembers(
        tx,
        unlocked.map((m) => m.organizationId),
      );
      // Read again under the lock: a role may have changed since the first read.
      const memberships = await this.accounts.memberships(userId, tx);
      const assessment = assessDeletion(memberships);
      if (assessment.blocking.length > 0) throw new ConflictException(DELETION_BLOCKED_MESSAGE);

      const anonymousEmail = deletedUserEmail(userId);
      // Before the organizations below, which cancel whatever invitations they still have.
      await this.cancelInvitationsTo(tx, userId, current.email, anonymousEmail);
      for (const { organizationId } of memberships) {
        await this.leave(tx, userId, organizationId);
      }
      for (const { organizationId } of assessment.toDelete) {
        await this.deleteOrganization(tx, userId, organizationId);
      }

      await this.accounts.scrubDeliveries(tx, userId, current.email, anonymousEmail);
      await this.accounts.scrubInviterName(tx, userId, DELETED_USER_NAME);
      await this.accounts.deleteCredentialsAndProfile(tx, userId);
      await this.accounts.anonymizeUser(tx, userId, {
        name: DELETED_USER_NAME,
        email: anonymousEmail,
      });
      // No values: the entry only says that the account was deleted, and when.
      await recordActivity(tx, accountScope(userId), {
        action: 'account_deleted',
        entityType: 'user',
        entity: { id: userId },
      });
      return { ...current, organizations: assessment.toDelete.map((m) => m.organizationName) };
    });

    await this.sendGoodbye(userId, deleted);
  }

  private async verifyPassword(userId: string, password: string): Promise<void> {
    const hash = await this.accounts.passwordHash(userId);
    const context = await this.auth.$context;
    // Better Auth's own verification, so a changed hashing setup applies here too.
    const valid = hash !== null && (await context.password.verify({ hash, password }));
    if (!valid) throw new BadRequestException('password: Incorrect password');
  }

  private async cancelInvitationsTo(
    tx: Transaction,
    userId: string,
    email: string,
    anonymousEmail: string,
  ) {
    const cancelled = await this.accounts.scrubInvitationsTo(tx, email, anonymousEmail);
    for (const row of cancelled) {
      await recordActivity(
        tx,
        { organizationId: row.organizationId, actor: userActor(userId) },
        { action: 'cancelled', entityType: 'invitation', entity: row },
      );
    }
  }

  /** The same end of a membership as a removal, logged as the user leaving. */
  private async leave(tx: Transaction, userId: string, organizationId: string) {
    const removed = await this.accounts.deleteMembership(tx, userId, organizationId);
    if (!removed) return;
    const actor = userActor(userId);
    await recordActivity(
      tx,
      { organizationId, actor },
      { action: 'member_left', entityType: 'member', entity: removed },
    );
    await endMembership(tx, organizationId, userId, actor);
  }

  private async deleteOrganization(tx: Transaction, userId: string, organizationId: string) {
    const scope = { organizationId, actor: userActor(userId) };
    for (const row of await this.accounts.cancelPendingInvitationsOf(tx, organizationId)) {
      await recordActivity(tx, scope, {
        action: 'cancelled',
        entityType: 'invitation',
        entity: row,
      });
    }
    const deleted = await this.accounts.deleteOrganization(
      tx,
      organizationId,
      deletedOrganizationSlug(organizationId),
    );
    if (deleted) {
      await recordActivity(tx, scope, {
        action: 'organization_deleted',
        entityType: 'organization',
        entity: deleted,
      });
    }
  }

  /**
   * The account is gone whatever happens here, so a failed email is only logged. Afterwards the
   * delivery log's copy of the address is replaced too.
   */
  private async sendGoodbye(
    userId: string,
    deleted: { name: string; email: string; organizations: string[] },
  ) {
    const idempotencyKey = `account-deleted:${userId}`;
    try {
      await this.email.send({
        template: 'account-deleted',
        to: deleted.email,
        props: {
          name: deleted.name,
          deletedAt: new Date(),
          deletedOrganizations: deleted.organizations,
        },
        idempotencyKey,
      });
    } catch (error) {
      this.logger.error(
        `Could not send the account deleted email to user ${userId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
    try {
      await this.accounts.scrubDeliveryRecipient(idempotencyKey, deletedUserEmail(userId));
    } catch (error) {
      this.logger.error(
        `Could not scrub the account deleted email of user ${userId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}

function toDeletionCheckDto({ blocking, toDelete }: DeletionAssessment): DeletionCheckDto {
  return {
    canDelete: blocking.length === 0,
    blockingOrganizations: blocking.map((m) => ({
      id: m.organizationId,
      name: m.organizationName,
    })),
    organizationsToDelete: toDelete.map((m) => ({
      id: m.organizationId,
      name: m.organizationName,
      eventCount: m.eventCount,
    })),
  };
}
