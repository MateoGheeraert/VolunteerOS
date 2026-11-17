import { z } from 'zod';
import type { CreateEvent, Event } from '@/api/generated/types.gen';
import { zCreateEvent } from '@/api/generated/zod.gen';
import { msg } from '@/i18n/keys';
import { brusselsToUtcIso, utcIsoToBrussels } from '@/lib/format';

/**
 * The event form works in a Brussels date + times; the API wants UTC timestamps. Shared by the
 * form (instant feedback) and the server actions (validated again). Messages are translation keys.
 * Length limits come from the generated API schema, so they follow the backend.
 */
const limits = {
  name: zCreateEvent.shape.name.maxLength ?? 200,
  description: zCreateEvent.shape.description.unwrap().unwrap().maxLength ?? 5000,
  location: zCreateEvent.shape.location.unwrap().unwrap().maxLength ?? 500,
};

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const eventFormSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, msg('eventForm.validation.nameRequired'))
      .max(limits.name, msg('eventForm.validation.nameTooLong')),
    description: z
      .string()
      .trim()
      .max(limits.description, msg('eventForm.validation.descriptionTooLong')),
    location: z.string().trim().max(limits.location, msg('eventForm.validation.locationTooLong')),
    date: z.string().regex(DATE, msg('eventForm.validation.dateRequired')),
    startTime: z.string().regex(TIME, msg('eventForm.validation.timeInvalid')),
    endTime: z.string().regex(TIME, msg('eventForm.validation.timeInvalid')),
  })
  .refine((value) => value.startTime !== value.endTime, {
    message: msg('eventForm.validation.endEqualsStart'),
    path: ['endTime'],
  });

export type EventFormValues = z.infer<typeof eventFormSchema>;

/** Which form field a Nest validation error on an API field belongs to. */
export const eventApiFields = { startsAt: 'startTime', endsAt: 'endTime' };

/** Status changes the backend allows (backend/src/features/events/event-status.ts). */
export type ChangeableStatus = Exclude<Event['status'], 'archived'>;
export const changeStatusSchema = z.object({
  status: z.enum(['draft', 'published', 'completed']) satisfies z.ZodType<ChangeableStatus>,
});

function nextDay(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const next = new Date(Date.UTC(year!, month! - 1, day! + 1));
  return next.toISOString().slice(0, 10);
}

/**
 * Form values → API body. An end time earlier than the start time means the event runs past
 * midnight (a bar until 02:00), so the end falls on the next day.
 */
export function toEventBody(values: EventFormValues): CreateEvent {
  const endDate = values.endTime < values.startTime ? nextDay(values.date) : values.date;
  return {
    name: values.name,
    description: values.description || null,
    location: values.location || null,
    startsAt: brusselsToUtcIso(values.date, values.startTime),
    endsAt: brusselsToUtcIso(endDate, values.endTime),
  };
}

/** API event → form values (for editing). */
export function toEventFormValues(
  event: Pick<CreateEvent, 'name' | 'description' | 'location' | 'startsAt' | 'endsAt'>,
): EventFormValues {
  const start = utcIsoToBrussels(event.startsAt);
  const end = utcIsoToBrussels(event.endsAt);
  return {
    name: event.name,
    description: event.description ?? '',
    location: event.location ?? '',
    date: start.date,
    startTime: start.time,
    endTime: end.time,
  };
}
