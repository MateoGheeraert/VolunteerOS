import 'server-only';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { z } from 'zod';
import {
  ORGANIZATION_CATEGORIES,
  ORGANIZATION_LEGAL_FORMS,
} from '@/features/organizations/profile';
import { forwardedHeaders } from './api';
import { ApiError } from './api-errors';
import { serverEnv } from './env';

/**
 * Server-side reads of Better Auth endpoints. They are not in openapi.json, so their responses are
 * validated here with small schemas (only the fields we use). Writes such as sign-in or accepting
 * an invitation go through the browser auth client, so Better Auth can set its cookies directly;
 * writes that set no cookies (the organization profile) go through server actions and `authPost`.
 */

const sessionSchema = z.object({
  user: z.object({ id: z.string(), name: z.string(), email: z.string() }),
  session: z.object({ activeOrganizationId: z.string().nullish() }),
});

const organizationSchema = z.object({ id: z.string(), name: z.string(), slug: z.string() });

const organizationProfileSchema = organizationSchema.extend({
  category: z.enum(ORGANIZATION_CATEGORIES),
  legalForm: z.enum(ORGANIZATION_LEGAL_FORMS).nullable(),
  description: z.string().nullable(),
  website: z.string().nullable(),
  foundingYear: z.number().int().nullable(),
  enterpriseNumber: z.string().nullable(),
  peppolId: z.string().nullable(),
  insurerName: z.string().nullable(),
  insurancePolicyNumber: z.string().nullable(),
  street: z.string().nullable(),
  houseNumber: z.string().nullable(),
  box: z.string().nullable(),
  postalCode: z.string().nullable(),
  city: z.string().nullable(),
  country: z.string(),
});

const invitationSchema = z.object({
  id: z.string(),
  email: z.string(),
  status: z.enum(['pending', 'accepted', 'rejected', 'canceled']),
  expiresAt: z.coerce.date(),
  organizationId: z.string(),
  organizationName: z.string(),
  inviterEmail: z.string(),
});

const orgRoleSchema = z.enum(['owner', 'admin', 'member']);

const activeMemberSchema = z.object({ id: z.string(), userId: z.string(), role: orgRoleSchema });

const memberSchema = z.object({
  id: z.string(),
  role: orgRoleSchema,
  createdAt: z.coerce.date(),
  user: z.object({ id: z.string(), name: z.string(), email: z.string() }),
});

const organizationInvitationSchema = z.object({
  id: z.string(),
  email: z.string(),
  role: z.enum(['admin', 'member']),
  status: z.enum(['pending', 'accepted', 'rejected', 'canceled']),
  expiresAt: z.coerce.date(),
});

export type OrgRole = z.infer<typeof orgRoleSchema>;
export type ActiveMember = z.infer<typeof activeMemberSchema>;
export type OrganizationMember = z.infer<typeof memberSchema>;
export type OrganizationInvitation = z.infer<typeof organizationInvitationSchema>;
export type SessionUser = z.infer<typeof sessionSchema>['user'];
export type OrganizationSummary = z.infer<typeof organizationSchema>;
export type OrganizationProfile = z.infer<typeof organizationProfileSchema>;
export type InvitationDetails = z.infer<typeof invitationSchema>;
export interface Session {
  user: SessionUser;
  activeOrganizationId: string | null;
}

/** GET /api/auth{path}; null when Better Auth answers with an error or an empty body. */
async function authGet<T extends z.ZodType>(path: string, schema: T): Promise<z.infer<T> | null> {
  // Read the request first: while prerendering, rendering stops here.
  const headers = await forwardedHeaders();
  const response = await fetch(new URL(`/api/auth${path}`, serverEnv().BACKEND_URL), {
    headers,
    cache: 'no-store',
  });
  if (!response.ok) return null;
  const body: unknown = await response.json();
  if (body === null) return null;
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    // Same rule as the generated SDK: an unexpected shape is a contract violation, never ignored.
    throw new Error(`Better Auth contract violation on ${path}: ${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}

/**
 * POST /api/auth{path}. Throws an ApiError when Better Auth refuses, so server actions report it
 * like any API error (its 400 messages name the field: `website: must be a http(s) URL`).
 */
export async function authPost(path: string, body: object): Promise<void> {
  const [forwarded, incoming] = await Promise.all([forwardedHeaders(), headers()]);
  // Better Auth refuses cookie-authenticated POSTs without a trusted Origin (CSRF check). A server
  // action is a POST from the browser, so its Origin is the app's own (Next.js checks that too).
  const origin = incoming.get('origin');
  const response = await fetch(new URL(`/api/auth${path}`, serverEnv().BACKEND_URL), {
    method: 'POST',
    headers: {
      ...forwarded,
      ...(origin && { origin }),
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  if (!response.ok) {
    const text = await response.text();
    let error: unknown = text;
    try {
      error = JSON.parse(text);
    } catch {
      // not JSON: keep the text
    }
    throw new ApiError(response.status, error, `POST /api/auth${path}`);
  }
}

/** The current session, or null. Deduplicated per request. */
export const getSession = cache(async (): Promise<Session | null> => {
  const data = await authGet('/get-session', sessionSchema);
  if (!data) return null;
  return { user: data.user, activeOrganizationId: data.session.activeOrganizationId ?? null };
});

export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect('/login');
  return session;
}

export const listOrganizations = cache(
  async (): Promise<OrganizationSummary[]> =>
    (await authGet('/organization/list', z.array(organizationSchema))) ?? [],
);

/** For pages inside the organizer app: a session with an active organization. */
export async function requireActiveOrganization() {
  const session = await requireSession();
  const organizations = await listOrganizations();
  const organization = organizations.find((org) => org.id === session.activeOrganizationId);
  // Still pointing at an organization they no longer belong to: they were removed from it.
  if (!organization) redirect(session.activeOrganizationId ? '/removed' : '/onboarding');
  return { ...session, organization, organizations };
}

/** The active organization with its whole profile (Better Auth lists every column). */
export async function getActiveOrganizationProfile(): Promise<OrganizationProfile> {
  const { organization } = await requireActiveOrganization();
  const organizations = await authGet('/organization/list', z.array(organizationProfileSchema));
  const profile = organizations?.find((org) => org.id === organization.id);
  if (!profile) redirect('/removed');
  return profile;
}

/** The caller's membership of the active organization. Deduplicated per request. */
export const getActiveMember = cache(async (): Promise<ActiveMember> => {
  await requireActiveOrganization();
  const member = await authGet('/organization/get-active-member', activeMemberSchema);
  if (!member) redirect('/removed');
  return member;
});

/** Everyone in the active organization; every member may see this. */
export async function listMembers(): Promise<OrganizationMember[]> {
  const data = await authGet(
    '/organization/list-members',
    z.object({ members: z.array(memberSchema) }),
  );
  return data?.members ?? [];
}

/**
 * Invitations still waiting for an answer, expired ones included (they can be resent).
 * Only admins may list invitations: Better Auth answers 403 to anyone else.
 */
export async function listPendingInvitations(): Promise<OrganizationInvitation[]> {
  const invitations = await authGet(
    '/organization/list-invitations',
    z.array(organizationInvitationSchema),
  );
  return (invitations ?? []).filter((invitation) => invitation.status === 'pending');
}

/** Only the invited (signed-in) user can read an invitation; anything else gives null. */
export function getInvitation(id: string): Promise<InvitationDetails | null> {
  return authGet(`/organization/get-invitation?id=${encodeURIComponent(id)}`, invitationSchema);
}
