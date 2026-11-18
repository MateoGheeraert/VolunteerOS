import { createHash } from 'node:crypto';
import { tryGetCurrentAuthEndpointContext } from '@better-auth/core/context';
import { Logger } from '@nestjs/common';
import type { BetterAuthOptions, User } from 'better-auth';
import { getSessionFromCtx, type createAuthMiddleware } from 'better-auth/api';
import { eq } from 'drizzle-orm';
import { accountScope, recordActivity } from '../activity/activity-log.js';
import { user as userTable } from '../db/schema/index.js';
import type { AuthDependencies } from './auth.js';

/** The context Better Auth passes to a `hooks.before` / `hooks.after` middleware. */
export type AuthHookContext = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0];

/** How long a verification or email change link works. */
export const EMAIL_LINK_VALID_HOURS = 24;

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/**
 * The payload of the token in the current /verify-email request. Only read after Better Auth
 * verified the token and acted on it, so it isn't checked again here.
 */
function verifyEmailTokenPayload(): { email?: string; updateTo?: string } | null {
  const ctx = tryGetCurrentAuthEndpointContext();
  const token: unknown = ctx?.path === '/verify-email' ? ctx.query?.token : undefined;
  if (typeof token !== 'string') return null;
  try {
    const payload = token.split('.')[1] ?? '';
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      email?: string;
      updateTo?: string;
    };
  } catch {
    return null;
  }
}

/**
 * The user's own account: email verification, email change and password change. Better Auth
 * runs these flows; this wires in our emails (links to Next.js pages, never to Better Auth's
 * redirect endpoints) and records them in the activity log.
 *
 * Log entries are account-level (no organization, entity `user`, actor = the user: only the
 * account owner can complete these flows, also from a link without a session). Like the
 * organization hooks (auth.activity.ts), they run after Better Auth's own write, so they can't
 * share its transaction; a failure is logged and the request still succeeds. Security notices
 * are sent the same way: the change has happened, so a failed notice doesn't undo it.
 */
export function accountHooks({ db, env, email }: AuthDependencies) {
  const logger = new Logger('Account');
  const logError = (message: string, error: unknown) =>
    logger.error(message, error instanceof Error ? error.stack : String(error));

  /** Records an account-level entry. `fields` are logged by name only. */
  const record = async (userId: string, action: string, fields: string[] = []) => {
    try {
      const entity = { id: userId, ...Object.fromEntries(fields.map((f) => [f, true])) };
      await recordActivity(db, accountScope(userId), {
        action,
        entityType: 'user',
        entity,
        // A "before" without the fields makes each of them a changed field (by name only).
        ...(fields.length > 0 && { before: { id: userId } as typeof entity }),
      });
    } catch (error) {
      logError(`Could not record ${action} of user ${userId}`, error);
    }
  };

  const notify = async (send: () => Promise<unknown>, what: string) => {
    try {
      await send();
    } catch (error) {
      logError(`Could not send the ${what} notice`, error);
    }
  };

  const sendPasswordChangedNotice = (user: Pick<User, 'id' | 'name' | 'email'>) => {
    const changedAt = new Date();
    return notify(
      () =>
        email.send({
          template: 'password-changed',
          to: user.email,
          props: { name: user.name, changedAt, resetUrl: `${env.APP_URL}/forgot-password` },
          idempotencyKey: `password-changed:${user.id}:${changedAt.toISOString()}`,
        }),
      'password changed',
    );
  };

  const emailVerification: NonNullable<BetterAuthOptions['emailVerification']> = {
    // Sent on sign-up and when resent from the settings; it never blocks signing in.
    sendOnSignUp: true,
    expiresIn: EMAIL_LINK_VALID_HOURS * 60 * 60,
    /**
     * Two flows share this callback: verifying the current address, and confirming a new one
     * (`user.email` is then the new address, which the user row doesn't have yet).
     */
    sendVerificationEmail: async ({ user, token }) => {
      const [stored] = await db
        .select({ email: userTable.email })
        .from(userTable)
        .where(eq(userTable.id, user.id));
      // The Next.js page posts the token to /api/auth/verify-email.
      const url = `${env.APP_URL}/verify-email?token=${encodeURIComponent(token)}`;
      const isChange = stored !== undefined && stored.email !== user.email;
      // The token is a credential: only its hash goes into the delivery log.
      if (isChange) {
        await email.send({
          template: 'email-change-confirmation',
          to: user.email,
          props: { name: user.name, confirmUrl: url, validForHours: EMAIL_LINK_VALID_HOURS },
          idempotencyKey: `email-change-confirmation:${sha256(token)}`,
        });
      } else {
        await email.send({
          template: 'email-verification',
          to: user.email,
          props: { name: user.name, verifyUrl: url, validForHours: EMAIL_LINK_VALID_HOURS },
          idempotencyKey: `email-verification:${sha256(token)}`,
        });
      }
    },
    afterEmailVerification: async (user) => {
      // Also called when a verified user confirms a new address: that is logged as the change.
      if (verifyEmailTokenPayload()?.updateTo) return;
      await record(user.id, 'email_verified');
    },
  };

  const userUpdateHooks: NonNullable<
    NonNullable<BetterAuthOptions['databaseHooks']>['user']
  >['update'] = {
    // Opening the link sent to the new address proves it, so it counts as verified.
    before: async (data) => {
      if (typeof data.email !== 'string' || !verifyEmailTokenPayload()?.updateTo) return;
      return { data: { ...data, emailVerified: true } };
    },
    after: async (updated) => {
      const token = verifyEmailTokenPayload();
      if (!token?.updateTo || !token.email || updated.email !== token.updateTo) return;
      await record(updated.id, 'email_changed', ['email']);
      const changedAt = new Date();
      await notify(
        () =>
          email.send({
            template: 'email-changed',
            to: token.email!,
            props: { name: updated.name, changedAt },
            idempotencyKey: `email-changed:${updated.id}:${changedAt.toISOString()}`,
          }),
        'email changed',
      );
    },
  };

  /** For `emailAndPassword.onPasswordReset`: the forgot-password flow completed. */
  const onPasswordReset = async ({ user }: { user: User }) => {
    await record(user.id, 'password_reset', ['password']);
    await sendPasswordChangedNotice(user);
  };

  /** For `hooks.after`: requests whose outcome only the response shows. */
  const afterRequest = async (ctx: AuthHookContext) => {
    const returned: unknown = ctx.context.returned;
    if (!returned || typeof returned !== 'object' || returned instanceof Error) return;

    if (ctx.path === '/change-email') {
      // Also when the new address belongs to someone else: Better Auth then silently sends
      // nothing, so the answer doesn't reveal which addresses have an account.
      const session = ctx.context.session ?? (await getSessionFromCtx(ctx));
      if (session) await record(session.user.id, 'email_change_requested');
    } else if (ctx.path === '/change-password' && 'user' in returned) {
      // The response carries the user: the old session may be gone (other sessions revoked).
      const user = returned.user as Pick<User, 'id' | 'name' | 'email'>;
      await record(user.id, 'password_changed', ['password']);
      await sendPasswordChangedNotice(user);
    }
  };

  return { emailVerification, userUpdateHooks, onPasswordReset, afterRequest };
}
