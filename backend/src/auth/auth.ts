import { createHash } from 'node:crypto';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { createAuthMiddleware } from 'better-auth/api';
import { organization } from 'better-auth/plugins';
import { and, asc, eq, isNull } from 'drizzle-orm';
import type { Env } from '../config/env.js';
import type { Database } from '../db/database.js';
import * as schema from '../db/schema/index.js';
import type { EmailService } from '../email/email.service.js';
import { accountHooks } from './auth.account.js';
import { organizationActivityHooks } from './auth.activity.js';
import { organizationAdditionalFields, parseOrganizationProfile } from './organization-profile.js';
import {
  assertOrganizationNotDeleted,
  hideDeletedOrganizations,
  isUserDeleted,
} from './auth.deletion.js';
import {
  assertAssignableRole,
  endMembership,
  failInvitationWithoutEmail,
  invitationEmailKey,
  rejectInvitationResendFlag,
  ROLE_CHANGE_ORG_ROLES,
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
  const account = accountHooks({ db, env, email });
  const invitationEmailCheck = failInvitationWithoutEmail(db);
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
        // A deleted account's address is a placeholder (…@invalid): nobody can receive it.
        if (await isUserDeleted(db, user.id)) return;
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
      onPasswordReset: account.onPasswordReset,
    },
    // Verification never blocks signing in (no `requireEmailVerification`): it only shows in
    // the account settings, and the email is sent again from there.
    emailVerification: account.emailVerification,
    user: {
      // The confirmation link goes to the new address; the email changes once it is opened.
      // No `sendChangeEmailConfirmation`: that would first ask the old address for approval.
      changeEmail: { enabled: true },
      additionalFields: {
        // Set when the account is deleted (anonymized, see features/account). Never sent to
        // clients, and never set through Better Auth's own endpoints.
        deletedAt: { type: 'date', required: false, input: false, returned: false },
      },
    },
    databaseHooks: {
      user: { update: account.userUpdateHooks },
      session: {
        create: {
          // A new session (every login) starts in the user's oldest organization, so returning
          // organizers land on their events instead of onboarding. The switcher changes it later.
          before: async (session) => {
            // A deleted account never gets a session (it has no credentials left either).
            if (await isUserDeleted(db, session.userId)) return false;
            const [membership] = await db
              .select({ organizationId: schema.member.organizationId })
              .from(schema.member)
              .innerJoin(
                schema.organization,
                eq(schema.organization.id, schema.member.organizationId),
              )
              .where(
                and(
                  eq(schema.member.userId, session.userId),
                  isNull(schema.organization.deletedAt),
                ),
              )
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
    hooks: {
      before: rejectInvitationResendFlag,
      after: createAuthMiddleware(async (ctx) => {
        // Better Auth swallows errors from `sendInvitationEmail`; this turns a failed invitation
        // email into a failed request.
        await invitationEmailCheck(ctx);
        await account.afterRequest(ctx);
        const organizations = await hideDeletedOrganizations(db, ctx);
        if (organizations) return ctx.json(organizations);
      }),
    },
    plugins: [
      organization({
        invitationExpiresIn: SEVEN_DAYS_IN_SECONDS,
        cancelPendingInvitationsOnReInvite: true,
        // Nothing is ever permanently deleted, and deleting an organization would cascade into
        // its events and history. Re-enable only with a soft-delete design for organizations.
        disableOrganizationDeletion: true,
        schema: {
          organization: {
            additionalFields: {
              ...organizationAdditionalFields,
              // Set when its last member deleted their account (see features/account).
              deletedAt: { type: 'date', required: false, input: false, returned: false },
            },
          },
        },
        // Better Auth itself enforces who may do what: only owners and admins invite, change
        // roles and remove members, and update the organization; only owners touch other owners
        // or make someone owner; the last owner stays.
        organizationHooks: {
          ...activityHooks,
          beforeCreateOrganization: async ({ organization: org }) => ({
            data: parseOrganizationProfile(org, { action: 'create' }),
          }),
          beforeUpdateOrganization: async (data) => {
            const profile = parseOrganizationProfile(data.organization, { action: 'update' });
            await activityHooks.beforeUpdateOrganization?.(data);
            return { data: profile };
          },
          beforeCreateInvitation: async ({ invitation }) => {
            assertAssignableRole(invitation.role);
            await assertOrganizationNotDeleted(db, invitation.organizationId);
          },
          beforeAcceptInvitation: async ({ invitation }) =>
            assertOrganizationNotDeleted(db, invitation.organizationId),
          beforeAddMember: async ({ member }) =>
            assertOrganizationNotDeleted(db, member.organizationId),
          // Owners can make someone else owner; Better Auth refuses that to admins.
          beforeUpdateMemberRole: async ({ newRole }) =>
            assertAssignableRole(newRole, ROLE_CHANGE_ORG_ROLES),
          // Deleting an account ends its memberships the same way (features/account).
          afterRemoveMember: async (data) => {
            await activityHooks.afterRemoveMember?.(data);
            await endMembership(db, data.member.organizationId, data.member.userId);
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
