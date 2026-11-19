import { z } from 'zod';
import type { CreateEvent, EditionRef, Event } from '@/api/generated/types.gen';
import { zCreateEvent } from '@/api/generated/zod.gen';
import { msg } from '@/i18n/keys';
import { brusselsToUtcIso, utcIsoToBrussels } from '@/lib/format';

/**
 * The event form works in Brussels dates + times; the API wants UTC timestamps. Shared by the
 * form (instant feedback) and the server actions (validated again). Messages are translation keys.
 * Length limits and event types come from the generated API schema, so they follow the backend.
 * Every value is a string, as form inputs give them; toEventBody converts.
 */
const limits = {
  name: zCreateEvent.shape.name.maxLength ?? 200,
  description: zCreateEvent.shape.description.unwrap().unwrap().maxLength ?? 5000,
  location: zCreateEvent.shape.location.unwrap().unwrap().maxLength ?? 500,
  retrospective: zCreateEvent.shape.retrospective.unwrap().unwrap().maxLength ?? 5000,
};

/** The kinds of event, in the order the form offers them. */
export const EVENT_TYPES = zCreateEvent.shape.eventType.options;
export type EventType = (typeof EVENT_TYPES)[number];

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** An optional head count: empty, or a whole number up to 7 digits. */
const ATTENDANCE = /^\d{0,7}$/;

/** An optional moment: both empty, or a valid date and time. */
const optionalDate = z.union([
  z.literal(''),
  z.string().regex(DATE, msg('eventForm.validation.dateRequired')),
]);
const optionalTime = z.union([
  z.literal(''),
  z.string().regex(TIME, msg('eventForm.validation.timeInvalid')),
]);

const attendance = z
  .string()
  .trim()
  .regex(ATTENDANCE, msg('eventForm.validation.attendanceInvalid'));

export const eventFormSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, msg('eventForm.validation.nameRequired'))
      .max(limits.name, msg('eventForm.validation.nameTooLong')),
    eventType: z.enum(EVENT_TYPES, { error: msg('eventForm.validation.typeRequired') }),
    description: z
      .string()
      .trim()
      .max(limits.description, msg('eventForm.validation.descriptionTooLong')),
    location: z.string().trim().max(limits.location, msg('eventForm.validation.locationTooLong')),
    date: z.string().regex(DATE, msg('eventForm.validation.dateRequired')),
    startTime: z.string().regex(TIME, msg('eventForm.validation.timeInvalid')),
    endDate: z.string().regex(DATE, msg('eventForm.validation.dateRequired')),
    endTime: z.string().regex(TIME, msg('eventForm.validation.timeInvalid')),
    /** Optional build-up before the event: both '' when there is none. */
    setupDate: optionalDate,
    setupTime: optionalTime,
    /** Optional teardown after the event. */
    teardownDate: optionalDate,
    teardownTime: optionalTime,
    /** '' when the event is a first edition. */
    previousEditionId: z.union([z.literal(''), z.uuid()]),
    expectedAttendance: attendance,
    actualAttendance: attendance,
    retrospective: z
      .string()
      .trim()
      .max(limits.retrospective, msg('eventForm.validation.retrospectiveTooLong')),
  })
  // ISO dates compare correctly as strings.
  .refine((value) => value.endDate >= value.date, {
    message: msg('eventForm.validation.endDateBeforeStart'),
    path: ['endDate'],
  })
  .refine((value) => value.endDate !== value.date || value.startTime !== value.endTime, {
    message: msg('eventForm.validation.endEqualsStart'),
    path: ['endTime'],
  })
  .refine((value) => (value.setupDate === '') === (value.setupTime === ''), {
    message: msg('eventForm.validation.dateAndTime'),
    path: ['setupTime'],
  })
  .refine((value) => (value.teardownDate === '') === (value.teardownTime === ''), {
    message: msg('eventForm.validation.dateAndTime'),
    path: ['teardownTime'],
  })
  // ISO date + time strings compare correctly as strings.
  .refine(
    (value) =>
      !value.setupDate ||
      !value.setupTime ||
      `${value.setupDate}T${value.setupTime}` < `${value.date}T${value.startTime}`,
    { message: msg('eventForm.validation.setupBeforeStart'), path: ['setupTime'] },
  )
  .refine(
    (value) =>
      !value.teardownDate ||
      !value.teardownTime ||
      `${value.teardownDate}T${value.teardownTime}` > `${effectiveEndDate(value)}T${value.endTime}`,
    { message: msg('eventForm.validation.teardownAfterEnd'), path: ['teardownTime'] },
  );

export type EventFormValues = z.infer<typeof eventFormSchema>;

/** Which form field a Nest validation error on an API field belongs to. */
export const eventApiFields = {
  startsAt: 'startTime',
  endsAt: 'endTime',
  setupStartsAt: 'setupTime',
  teardownEndsAt: 'teardownTime',
};

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
 * When the event ends, as a Brussels date. On a single-day event an end time earlier than the
 * start time means it runs past midnight (a bar until 02:00), so the end falls on the next day.
 * With a later end date the times are taken as they are (Fri 18:00 → Sun 23:00).
 */
function effectiveEndDate(values: {
  date: string;
  endDate: string;
  startTime: string;
  endTime: string;
}): string {
  const pastMidnight = values.endDate === values.date && values.endTime < values.startTime;
  return pastMidnight ? nextDay(values.date) : values.endDate;
}

/** The start as a UTC ISO string, or null while the form has no valid date and time yet. */
export function formStartIso(values: Pick<EventFormValues, 'date' | 'startTime'>): string | null {
  if (!DATE.test(values.date) || !TIME.test(values.startTime)) return null;
  return brusselsToUtcIso(values.date, values.startTime);
}

const toCount = (value: string) => (value === '' ? null : Number(value));

/** Form values → API body. */
export function toEventBody(values: EventFormValues): CreateEvent {
  return {
    name: values.name,
    eventType: values.eventType,
    description: values.description || null,
    location: values.location || null,
    startsAt: brusselsToUtcIso(values.date, values.startTime),
    endsAt: brusselsToUtcIso(effectiveEndDate(values), values.endTime),
    setupStartsAt:
      values.setupDate && values.setupTime
        ? brusselsToUtcIso(values.setupDate, values.setupTime)
        : null,
    teardownEndsAt:
      values.teardownDate && values.teardownTime
        ? brusselsToUtcIso(values.teardownDate, values.teardownTime)
        : null,
    previousEditionId: values.previousEditionId || null,
    expectedAttendance: toCount(values.expectedAttendance),
    actualAttendance: toCount(values.actualAttendance),
    retrospective: values.retrospective || null,
  };
}

/**
 * API event → form values (for editing). An event that ends early the next morning is shown as
 * it was entered: one date, an end time before the start time. Saving it gives the same times.
 */
export function toEventFormValues(
  event: Pick<
    CreateEvent,
    | 'name'
    | 'eventType'
    | 'description'
    | 'location'
    | 'startsAt'
    | 'endsAt'
    | 'setupStartsAt'
    | 'teardownEndsAt'
    | 'previousEditionId'
    | 'expectedAttendance'
    | 'actualAttendance'
    | 'retrospective'
  >,
): EventFormValues {
  const start = utcIsoToBrussels(event.startsAt);
  const end = utcIsoToBrussels(event.endsAt);
  const pastMidnight = end.date === nextDay(start.date) && end.time < start.time;
  const setup = event.setupStartsAt ? utcIsoToBrussels(event.setupStartsAt) : null;
  const teardown = event.teardownEndsAt ? utcIsoToBrussels(event.teardownEndsAt) : null;
  return {
    name: event.name,
    eventType: event.eventType,
    description: event.description ?? '',
    location: event.location ?? '',
    date: start.date,
    startTime: start.time,
    endDate: pastMidnight ? start.date : end.date,
    endTime: end.time,
    setupDate: setup?.date ?? '',
    setupTime: setup?.time ?? '',
    teardownDate: teardown?.date ?? '',
    teardownTime: teardown?.time ?? '',
    previousEditionId: event.previousEditionId ?? '',
    expectedAttendance: event.expectedAttendance?.toString() ?? '',
    actualAttendance: event.actualAttendance?.toString() ?? '',
    retrospective: event.retrospective ?? '',
  };
}

/** An event the form offers as the previous edition. */
export type EditionOption = EditionRef;

/**
 * Events that `eventId` (or a new event) may continue: every other event the user can see,
 * except editions another event already continues. The form also hides those that don't start
 * before the event; the backend checks all of it again.
 */
export function editionOptions(events: Event[], eventId?: string): EditionOption[] {
  const continued = new Set(
    events
      .filter((event) => event.id !== eventId && event.previousEditionId)
      .map((event) => event.previousEditionId),
  );
  return events
    .filter((event) => event.id !== eventId && !continued.has(event.id))
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt))
    .map(({ id, name, startsAt }) => ({ id, name, startsAt }));
}
