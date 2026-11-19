import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import { dateTimeInput, dateTimeOutput } from '../../common/schemas.js';
import { event, eventMember, user } from '../../db/schema/index.js';

/**
 * API contracts for events, derived from the Drizzle tables: a column's type, nullability and
 * enum values come from the table, so adding a column only means adding it to a `pick`.
 * These schemas validate requests and produce the OpenAPI document the frontend is generated from.
 */

const endsAfterStart = (value: { startsAt?: Date; endsAt?: Date }) =>
  !value.startsAt || !value.endsAt || value.endsAt > value.startsAt;
const endsAfterStartIssue = { message: 'endsAt must be after startsAt', path: ['endsAt'] };

/** Setup happens before the event starts, teardown after it ends. */
const setupBeforeStart = (value: { startsAt?: Date; setupStartsAt?: Date | null }) =>
  !value.startsAt || !value.setupStartsAt || value.setupStartsAt < value.startsAt;
const setupBeforeStartIssue = {
  message: 'setupStartsAt: must be before startsAt',
  path: ['setupStartsAt'],
};
const teardownAfterEnd = (value: { endsAt?: Date; teardownEndsAt?: Date | null }) =>
  !value.endsAt || !value.teardownEndsAt || value.teardownEndsAt > value.endsAt;
const teardownAfterEndIssue = {
  message: 'teardownEndsAt: must be after endsAt',
  path: ['teardownEndsAt'],
};

const eventInput = createInsertSchema(event, {
  name: (schema) => schema.trim().min(1).max(200),
  description: (schema) => schema.trim().max(5000),
  location: (schema) => schema.trim().max(500),
  startsAt: dateTimeInput,
  endsAt: dateTimeInput,
  setupStartsAt: dateTimeInput.nullable().optional(),
  teardownEndsAt: dateTimeInput.nullable().optional(),
  expectedAttendance: (schema) => schema.min(0),
  actualAttendance: (schema) => schema.min(0),
  retrospective: (schema) => schema.trim().max(5000),
});

// Fields a client may set. id, organizationId and timestamps are always set by the server.
const editableFields = {
  name: true,
  eventType: true,
  description: true,
  location: true,
  startsAt: true,
  endsAt: true,
  setupStartsAt: true,
  teardownEndsAt: true,
  previousEditionId: true,
  expectedAttendance: true,
  actualAttendance: true,
  retrospective: true,
} as const;

export const createEventSchema = eventInput
  .pick(editableFields)
  .refine(endsAfterStart, endsAfterStartIssue)
  .refine(setupBeforeStart, setupBeforeStartIssue)
  .refine(teardownAfterEnd, teardownAfterEndIssue)
  .meta({ id: 'CreateEvent' });
export type CreateEventInput = z.infer<typeof createEventSchema>;

export const updateEventSchema = eventInput
  .pick(editableFields)
  .extend({
    // Archiving has its own endpoint, so it can't be set here.
    status: z.enum(['draft', 'published', 'completed']),
  })
  .partial()
  .refine(endsAfterStart, endsAfterStartIssue)
  .refine(setupBeforeStart, setupBeforeStartIssue)
  .refine(teardownAfterEnd, teardownAfterEndIssue)
  .meta({ id: 'UpdateEvent' });
export type UpdateEventInput = z.infer<typeof updateEventSchema>;

export const eventSchema = createSelectSchema(event, {
  startsAt: dateTimeOutput,
  endsAt: dateTimeOutput,
  setupStartsAt: dateTimeOutput.nullable(),
  teardownEndsAt: dateTimeOutput.nullable(),
  registrationDeadline: dateTimeOutput.nullable(),
  schedulePublishedAt: dateTimeOutput.nullable(),
  createdAt: dateTimeOutput,
  updatedAt: dateTimeOutput,
})
  // Soft deletion is internal: deleted events are never returned.
  .omit({ deletedAt: true })
  .meta({ id: 'Event' });
export type EventDto = z.infer<typeof eventSchema>;

/** Another edition in the same series, as shown next to an event ("Continues: ..."). */
export const editionRefSchema = createSelectSchema(event, { startsAt: dateTimeOutput })
  .pick({ id: true, name: true, startsAt: true })
  .meta({ id: 'EditionRef' });
export type EditionRefDto = z.infer<typeof editionRefSchema>;

/**
 * One event with its neighbouring editions. A neighbour the caller may not see, or one that was
 * deleted, is `null`.
 */
export const eventDetailSchema = eventSchema
  .extend({
    previousEdition: editionRefSchema.nullable(),
    nextEdition: editionRefSchema.nullable(),
  })
  .meta({ id: 'EventDetail' });
export type EventDetailDto = z.infer<typeof eventDetailSchema>;

export const addEventMemberSchema = createInsertSchema(eventMember, {
  userId: (schema) => schema.min(1),
})
  .pick({ userId: true, role: true })
  .required({ userId: true })
  .meta({ id: 'AddEventMember' });
export type AddEventMemberInput = z.input<typeof addEventMemberSchema>;

export const eventMemberSchema = createSelectSchema(eventMember, { createdAt: dateTimeOutput })
  .omit({ deletedAt: true })
  .extend(createSelectSchema(user).pick({ name: true, email: true }).shape)
  .meta({ id: 'EventMember' });
export type EventMemberDto = z.infer<typeof eventMemberSchema>;
