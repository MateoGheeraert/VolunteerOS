import 'server-only';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { z } from 'zod';
import { forwardedHeaders } from './api';
import { serverEnv } from './env';

/**
 * Server-side reads of Better Auth endpoints. They are not in openapi.json, so their responses are
 * validated here with small schemas (only the fields we use). Writes such as sign-in or accepting
 * an invitation go through the browser auth client, so Better Auth can set its cookies directly.
 */

const sessionSchema = z.object({
  user: z.object({ id: z.string(), name: z.string(), email: z.string() }),
  session: z.object({ activeOrganizationId: z.string().nullish() }),
});

const organizationSchema = z.object({ id: z.string(), name: z.string(), slug: z.string() });

const invitationSchema = z.object({
  id: z.string(),
  email: z.string(),
  status: z.enum(['pending', 'accepted', 'rejected', 'canceled']),
  expiresAt: z.coerce.date(),
  organizationId: z.string(),
  organizationName: z.string(),
  inviterEmail: z.string(),
});

export type SessionUser = z.infer<typeof sessionSchema>['user'];
export type OrganizationSummary = z.infer<typeof organizationSchema>;
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
  if (!organization) redirect('/onboarding');
  return { ...session, organization, organizations };
}

/** Only the invited (signed-in) user can read an invitation; anything else gives null. */
export function getInvitation(id: string): Promise<InvitationDetails | null> {
  return authGet(`/organization/get-invitation?id=${encodeURIComponent(id)}`, invitationSchema);
}
