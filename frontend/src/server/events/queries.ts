import 'server-only';
import { cache } from 'react';
import {
  eventsControllerGet,
  eventsControllerList,
  eventsControllerListMembers,
} from '@/api/generated';
import { query } from '../query';

/** Every event of the active organization: all members see all events. */
export const listEvents = () => query(eventsControllerList());

/** One event, deduplicated per request (the event header and the page both need it). */
export const getEvent = cache((eventId: string) =>
  query(eventsControllerGet({ path: { eventId } })),
);

/** The event's managers (its `event_member` rows). */
export const listEventManagers = (eventId: string) =>
  query(eventsControllerListMembers({ path: { eventId } }));
