import 'server-only';
import { cache } from 'react';
import {
  eventsControllerGet,
  eventsControllerList,
  eventsControllerListMembers,
  overviewControllerGet,
} from '@/api/generated';
import { isOrgAdmin } from '@/features/members/permissions';
import { getActiveMember } from '../auth';
import { query } from '../query';

/**
 * Every event of the active organization: all members see all events. Deduplicated per request
 * (the sidebar's event switcher and a page can both need it).
 */
export const listEvents = cache(() => query(eventsControllerList()));

/** One event, deduplicated per request (the event header and the page both need it). */
export const getEvent = cache((eventId: string) =>
  query(eventsControllerGet({ path: { eventId } })),
);

/** The event's managers (its `event_member` rows). */
export const listEventManagers = (eventId: string) =>
  query(eventsControllerListMembers({ path: { eventId } }));

/**
 * Whether the signed-in user may change the event: an organization admin or one of its managers.
 * It only decides which controls show; the backend enforces it.
 */
export const canManageEvent = cache(async (eventId: string) => {
  const [me, managers] = await Promise.all([getActiveMember(), listEventManagers(eventId)]);
  return isOrgAdmin(me.role) || managers.some((manager) => manager.userId === me.userId);
});

/** The event overview: every card's numbers and status, and Mila's hints for the caller. */
export const getEventOverview = (eventId: string) =>
  query(overviewControllerGet({ path: { eventId } }));
