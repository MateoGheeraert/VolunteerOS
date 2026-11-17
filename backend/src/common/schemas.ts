import { z } from 'zod';

/**
 * Building blocks for API schemas. Database timestamps are `Date` objects, but JSON carries
 * ISO-8601 strings, so API schemas swap the generated date fields for these.
 */

/** Request field: ISO-8601 with an offset (e.g. 2026-12-12T18:00:00+01:00), parsed to a Date. */
export const dateTimeInput = z.iso
  .datetime({ offset: true })
  .transform((value) => new Date(value))
  .meta({ format: 'date-time' });

/** Response field: a Date sent as an ISO-8601 string in UTC. */
export const dateTimeOutput = z.iso.datetime();
