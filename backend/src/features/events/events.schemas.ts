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

const eventInput = createInsertSchema(event, {
  name: (schema) => schema.trim().min(1).max(200),
  description: (schema) => schema.trim().max(5000),
  location: (schema) => schema.trim().max(500),
  startsAt: dateTimeInput,
  endsAt: dateTimeInput,
});

// Fields a client may set. id, organizationId and timestamps are always set by the server.
const editableFields = {
  name: true,
  description: true,
  location: true,
  startsAt: true,
  endsAt: true,
} as const;

export const createEventSchema = eventInput
  .pick(editableFields)
  .refine(endsAfterStart, endsAfterStartIssue)
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
  .meta({ id: 'UpdateEvent' });
export type UpdateEventInput = z.infer<typeof updateEventSchema>;

export const eventSchema = createSelectSchema(event, {
  startsAt: dateTimeOutput,
  endsAt: dateTimeOutput,
  createdAt: dateTimeOutput,
  updatedAt: dateTimeOutput,
})
  // Soft deletion is internal: deleted events are never returned.
  .omit({ deletedAt: true })
  .meta({ id: 'Event' });
export type EventDto = z.infer<typeof eventSchema>;

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
