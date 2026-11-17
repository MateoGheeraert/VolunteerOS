import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { organization } from 'better-auth/plugins';
import { asc, eq } from 'drizzle-orm';
import type { Env } from '../config/env.js';
import type { Database } from '../db/database.js';
import * as schema from '../db/schema/index.js';
import type { EmailService } from '../email/email.service.js';
import { organizationInvitationEmail, passwordResetEmail } from '../email/templates.js';
import { organizationActivityHooks } from './auth.activity.js';

const SEVEN_DAYS_IN_SECONDS = 7 * 24 * 60 * 60;
const ONE_HOUR_IN_SECONDS = 60 * 60;

export interface AuthDependencies {
  db: Database;
  env: Pick<Env, 'APP_URL' | 'BETTER_AUTH_SECRET'>;
  email: EmailService;
}

export function createAuth({ db, env, email }: AuthDependencies) {
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
        await email.send(
          passwordResetEmail({
            to: user.email,
            name: user.name,
            resetUrl: `${env.APP_URL}/reset-password?token=${encodeURIComponent(token)}`,
          }),
        );
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
    plugins: [
      organization({
        invitationExpiresIn: SEVEN_DAYS_IN_SECONDS,
        cancelPendingInvitationsOnReInvite: true,
        // Nothing is ever permanently deleted, and deleting an organization would cascade into
        // its events and history. Re-enable only with a soft-delete design for organizations.
        disableOrganizationDeletion: true,
        organizationHooks: organizationActivityHooks(db),
        sendInvitationEmail: async ({ id, email: to, organization: org, inviter }) => {
          await email.send(
            organizationInvitationEmail({
              to,
              organizationName: org.name,
              inviterName: inviter.user.name,
              acceptUrl: `${env.APP_URL}/invitations/${id}`,
            }),
          );
        },
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
export type AuthSession = NonNullable<Awaited<ReturnType<Auth['api']['getSession']>>>;
export type AuthUser = AuthSession['user'];

export const AUTH = Symbol('AUTH');
