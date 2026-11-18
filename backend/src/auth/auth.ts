import { createHash } from 'node:crypto';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { organization } from 'better-auth/plugins';
import { asc, eq } from 'drizzle-orm';
import type { Env } from '../config/env.js';
import type { Database } from '../db/database.js';
import * as schema from '../db/schema/index.js';
import type { EmailService } from '../email/email.service.js';
import { organizationActivityHooks } from './auth.activity.js';
import {
  assertAssignableRole,
  endEventAssignments,
  failInvitationWithoutEmail,
  invitationEmailKey,
  rejectInvitationResendFlag,
  releaseOpenTasks,
} from './auth.membership.js';

const SEVEN_DAYS_IN_SECONDS = 7 * 24 * 60 * 60;
const ONE_HOUR_IN_SECONDS = 60 * 60;

export interface AuthDependencies {
  db: Database;
  env: Pick<Env, 'APP_URL' | 'BETTER_AUTH_SECRET'>;
  email: Pick<EmailService, 'send'>;
}

export function createAuth({ db, env, email }: AuthDependencies) {
  const activityHooks = organizationActivityHooks(db);
  return betterAuth({
    appName: 'VolunteerOS',
    // The browser only ever talks to Next.js, which proxies /api/auth/* to Nest.
    // So the public URL is the Next.js origin, never the internal Nest host.
    baseURL: env.APP_URL,
    basePath: '/api/auth',
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.APP_URL],
    database: drizzleAdapter(db, { provider: 'pg', schema }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      resetPasswordTokenExpiresIn: ONE_HOUR_IN_SECONDS,
      revokeSessionsOnPasswordReset: true,
      // The link points at the Next.js page, which posts the token to /api/auth/reset-password.
      // Better Auth's own `url` goes through a redirect endpoint we don't need.
      sendResetPassword: async ({ user, token }) => {
        await email.send({
          template: 'password-reset',
          to: user.email,
          props: {
            name: user.name,
            resetUrl: `${env.APP_URL}/reset-password?token=${encodeURIComponent(token)}`,
            validForHours: ONE_HOUR_IN_SECONDS / 3600,
          },
          // The token is a credential: only its hash goes into the delivery log.
          idempotencyKey: `password-reset:${createHash('sha256').update(token).digest('hex')}`,
        });
      },
    },
    databaseHooks: {
      session: {
        create: {
          // A new session (every login) starts in the user's oldest organization, so returning
          // organizers land on their events instead of onboarding. The switcher changes it later.
          before: async (session) => {
            const [membership] = await db
              .select({ organizationId: schema.member.organizationId })
              .from(schema.member)
              .where(eq(schema.member.userId, session.userId))
              .orderBy(asc(schema.member.createdAt))
              .limit(1);
            return {
              data: { ...session, activeOrganizationId: membership?.organizationId ?? null },
            };
          },
        },
      },
    },
    advanced: {
      // Only the Next.js server can reach Nest, so the forwarded client IP is trustworthy.
      // Without this, rate limiting would see every request as coming from Next.js.
      ipAddress: { ipAddressHeaders: ['x-forwarded-for'] },
    },
    // Better Auth swallows errors from `sendInvitationEmail`; the after-hook turns a failed
    // invitation email into a failed request.
    hooks: { before: rejectInvitationResendFlag, after: failInvitationWithoutEmail(db) },
    plugins: [
      organization({
        invitationExpiresIn: SEVEN_DAYS_IN_SECONDS,
        cancelPendingInvitationsOnReInvite: true,
        // Nothing is ever permanently deleted, and deleting an organization would cascade into
        // its events and history. Re-enable only with a soft-delete design for organizations.
        disableOrganizationDeletion: true,
        // Better Auth itself enforces who may do what: only owners and admins invite, change
        // roles and remove members; only owners touch other owners; the last owner stays.
        organizationHooks: {
          ...activityHooks,
          beforeCreateInvitation: async ({ invitation }) => assertAssignableRole(invitation.role),
          beforeUpdateMemberRole: async ({ newRole }) => assertAssignableRole(newRole),
          afterRemoveMember: async (data) => {
            await activityHooks.afterRemoveMember?.(data);
            await endEventAssignments(db, data.member.organizationId, data.member.userId);
            await releaseOpenTasks(db, data.member.organizationId, data.member.userId);
          },
        },
        // A re-invite creates a new invitation id, so it sends a new email; a retried request
        // for the same invitation does not.
        sendInvitationEmail: async ({
          id,
          email: to,
          role,
          organization: org,
          inviter,
          invitation,
        }) => {
          await email.send({
            template: 'organization-invitation',
            to,
            organizationId: org.id,
            props: {
              inviterName: inviter.user.name,
              organizationName: org.name,
              role,
              acceptUrl: `${env.APP_URL}/invitations/${id}`,
              expiresAt: new Date(invitation.expiresAt),
            },
            idempotencyKey: invitationEmailKey(id),
          });
        },
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
export type AuthSession = NonNullable<Awaited<ReturnType<Auth['api']['getSession']>>>;
export type AuthUser = AuthSession['user'];

export const AUTH = Symbol('AUTH');
