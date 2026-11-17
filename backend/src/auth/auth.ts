import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { organization } from 'better-auth/plugins';
import type { Env } from '../config/env.js';
import type { Database } from '../db/database.js';
import * as schema from '../db/schema/index.js';
import type { EmailService } from '../email/email.service.js';
import { organizationInvitationEmail } from '../email/templates.js';

const SEVEN_DAYS_IN_SECONDS = 7 * 24 * 60 * 60;

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
