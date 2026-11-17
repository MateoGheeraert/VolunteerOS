import 'server-only';
import { cache } from 'react';
import { eventsControllerGet, eventsControllerList } from '@/api/generated';
import { query } from '../query';

/** Events the current user may see in the active organization (admins: all; others: assigned). */
export const listEvents = () => query(eventsControllerList());

/** One event, deduplicated per request (the event header and the page both need it). */
export const getEvent = cache((eventId: string) =>
  query(eventsControllerGet({ path: { eventId } })),
);
