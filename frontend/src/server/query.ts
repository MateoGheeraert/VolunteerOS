import 'server-only';
import { forbidden, notFound, redirect } from 'next/navigation';
import { ApiError, isContractViolation } from './api-errors';

/**
 * Runs an SDK read for a server component and returns its data. API errors become the matching
 * page: 401 → login, no active organization → onboarding, removed from it → /removed,
 * 403 → forbidden, 400/404 → not found (a read only gets a 400 from a malformed id in the URL).
 *
 *   export const getEvent = (eventId: string) => query(eventsControllerGet({ path: { eventId } }));
 */
export async function query<T>(request: Promise<{ data: T }>): Promise<T> {
  try {
    return (await request).data;
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 401) redirect('/login');
      if (error.needsOrganization) redirect('/onboarding');
      if (error.lostMembership) redirect('/removed');
      if (error.status === 403) forbidden();
      if (error.status === 400 || error.status === 404) notFound();
    }
    if (isContractViolation(error)) {
      console.error('API contract violation in a read', error.issues);
    }
    // Everything else (including Next's own prerender signals) goes up unchanged.
    throw error;
  }
}
