import { z } from 'zod';
import type {
  CreateApplication,
  CreateShift,
  Event,
  PublicRegistration,
  UpdateRegistration,
} from '@/api/generated/types.gen';
import { msg } from '@/i18n/keys';
import { brusselsToUtcIso, utcIsoToBrussels } from '@/lib/format';

/**
 * Form schemas for planning, shared by the forms (instant feedback) and the server actions
 * (validated again). Messages are translation keys. Limits mirror the backend schemas.
 */

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const optionalText = (max: number) =>
  z.string().trim().max(max, msg('planning.validation.tooLong'));

/** Suggestions offered as chips when creating teams. */
export const TEAM_SUGGESTIONS = [
  'Bar',
  'Kassa',
  'Opbouw',
  'Afbraak',
  'Onthaal',
  'Keuken',
  'Parking',
  'Afwas',
] as const;

// ── Teams ──────────────────────────────────────────────────────────────────────────────────────

export const teamFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, msg('planning.validation.nameRequired'))
    .max(100, msg('planning.validation.tooLong')),
  description: optionalText(2000),
  defaultMeetingPoint: optionalText(200),
});
export type TeamFormValues = z.infer<typeof teamFormSchema>;

// ── Shifts ─────────────────────────────────────────────────────────────────────────────────────

export const shiftFormSchema = z
  .object({
    teamId: z.uuid(msg('planning.validation.teamRequired')),
    date: z.string().regex(DATE, msg('planning.validation.dateRequired')),
    startTime: z.string().regex(TIME, msg('planning.validation.timeInvalid')),
    endTime: z.string().regex(TIME, msg('planning.validation.timeInvalid')),
    capacity: z
      .string()
      .trim()
      .regex(/^\d{1,3}$/, msg('planning.validation.capacityInvalid'))
      .refine((value) => Number(value) >= 1 && Number(value) <= 500, {
        message: msg('planning.validation.capacityInvalid'),
      }),
    meetingPoint: optionalText(200),
  })
  .refine((value) => value.startTime !== value.endTime, {
    message: msg('planning.validation.endEqualsStart'),
    path: ['endTime'],
  });
export type ShiftFormValues = z.infer<typeof shiftFormSchema>;

/** The form's schema: also checks the shift falls within the event (setup and teardown included). */
export function shiftFormSchemaFor(window: { startsAt: string; endsAt: string }) {
  return shiftFormSchema.superRefine((values, ctx) => {
    if (!DATE.test(values.date) || !TIME.test(values.startTime) || !TIME.test(values.endTime)) {
      return;
    }
    const { startsAt, endsAt } = toShiftBody({ ...values, capacity: '1' });
    if (startsAt < window.startsAt || endsAt > window.endsAt) {
      ctx.addIssue({
        code: 'custom',
        message: msg('planning.validation.outsideWindow'),
        path: [startsAt < window.startsAt ? 'startTime' : 'endTime'],
      });
    }
  });
}

/** Which form field a Nest validation error on a shift field belongs to. */
export const shiftApiFields = { startsAt: 'startTime', endsAt: 'endTime', teamId: 'teamId' };

export function nextDay(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, day! + 1)).toISOString().slice(0, 10);
}

/** An end time at or before the start time is on the next day (a bar shift until 02:00). */
export function toShiftBody(values: ShiftFormValues): CreateShift {
  const endDate = values.endTime <= values.startTime ? nextDay(values.date) : values.date;
  return {
    teamId: values.teamId,
    startsAt: brusselsToUtcIso(values.date, values.startTime),
    endsAt: brusselsToUtcIso(endDate, values.endTime),
    capacity: Number(values.capacity),
    meetingPoint: values.meetingPoint || null,
  };
}

export function toShiftFormValues(shift: {
  teamId: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  meetingPoint: string | null;
}): ShiftFormValues {
  const start = utcIsoToBrussels(shift.startsAt);
  const end = utcIsoToBrussels(shift.endsAt);
  return {
    teamId: shift.teamId,
    date: start.date,
    startTime: start.time,
    endTime: end.time,
    capacity: String(shift.capacity),
    meetingPoint: shift.meetingPoint ?? '',
  };
}

// ── Volunteers (added by an organizer) ─────────────────────────────────────────────────────────

export const volunteerFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, msg('planning.validation.nameRequired'))
    .max(200, msg('planning.validation.tooLong')),
  email: z
    .string()
    .trim()
    .pipe(z.union([z.literal(''), z.email(msg('planning.validation.emailInvalid'))])),
  phone: optionalText(50),
  notes: optionalText(2000),
  preferredTeamId: z.union([z.literal(''), z.uuid()]),
  wholeEvent: z.boolean(),
  availableShiftIds: z.array(z.uuid()).max(500),
});
export type VolunteerFormValues = z.infer<typeof volunteerFormSchema>;

export const volunteerApiFields = { email: 'email', name: 'name' };

export function toVolunteerBody(values: VolunteerFormValues): CreateApplication {
  return {
    name: values.name,
    email: values.email || null,
    phone: values.phone || null,
    notes: values.notes || null,
    preferredTeamId: values.preferredTeamId || null,
    wholeEvent: values.wholeEvent,
    availableShiftIds: values.wholeEvent ? [] : values.availableShiftIds,
  };
}

// ── Assignments and publishing ─────────────────────────────────────────────────────────────────

export const assignSchema = z.object({
  applicationId: z.uuid(),
  shiftId: z.uuid(),
  acknowledgeWarnings: z.boolean(),
});
export const moveSchema = z.object({ shiftId: z.uuid(), acknowledgeWarnings: z.boolean() });
/** `scheduleFinal`: the organizer states everyone is assigned and nothing will change. */
export const publishSchema = z.object({
  includeNotNeeded: z.boolean(),
  scheduleFinal: z.literal(true),
});

// ── Registration settings ──────────────────────────────────────────────────────────────────────

export const registrationFormSchema = z
  .object({
    registrationOpen: z.boolean(),
    deadlineDate: z.union([z.literal(''), z.string().regex(DATE)]),
    deadlineTime: z.union([
      z.literal(''),
      z.string().regex(TIME, msg('planning.validation.timeInvalid')),
    ]),
    volunteerCommitment: z.enum(['shifts', 'whole_event']),
    shiftsPerVolunteer: z
      .string()
      .trim()
      .regex(/^\d{1,2}$/, msg('planning.validation.shiftsPerVolunteerInvalid'))
      .refine((value) => Number(value) >= 1 && Number(value) <= 50, {
        message: msg('planning.validation.shiftsPerVolunteerInvalid'),
      }),
  })
  .refine((value) => (value.deadlineDate === '') === (value.deadlineTime === ''), {
    message: msg('planning.validation.dateAndTime'),
    path: ['deadlineTime'],
  });
export type RegistrationFormValues = z.infer<typeof registrationFormSchema>;

export function toRegistrationBody(values: RegistrationFormValues): UpdateRegistration {
  return {
    registrationOpen: values.registrationOpen,
    registrationDeadline:
      values.deadlineDate && values.deadlineTime
        ? brusselsToUtcIso(values.deadlineDate, values.deadlineTime)
        : null,
    volunteerCommitment: values.volunteerCommitment,
    shiftsPerVolunteer: Number(values.shiftsPerVolunteer),
  };
}

export function toRegistrationFormValues(
  event: Pick<
    Event,
    'registrationOpen' | 'registrationDeadline' | 'volunteerCommitment' | 'shiftsPerVolunteer'
  >,
): RegistrationFormValues {
  const deadline = event.registrationDeadline ? utcIsoToBrussels(event.registrationDeadline) : null;
  return {
    registrationOpen: event.registrationOpen,
    deadlineDate: deadline?.date ?? '',
    deadlineTime: deadline?.time ?? '',
    volunteerCommitment: event.volunteerCommitment,
    shiftsPerVolunteer: String(event.shiftsPerVolunteer),
  };
}

// ── Public registration ────────────────────────────────────────────────────────────────────────

const publicRegistrationBase = z.object({
  name: z
    .string()
    .trim()
    .min(1, msg('register.validation.nameRequired'))
    .max(200, msg('planning.validation.tooLong')),
  email: z
    .string()
    .trim()
    .pipe(z.email(msg('register.validation.emailInvalid'))),
  phone: optionalText(50),
  availableShiftIds: z.array(z.uuid()).max(500),
  wholeEvent: z.boolean(),
  preferredTeamId: z.union([z.literal(''), z.uuid()]),
  notes: optionalText(2000),
  consent: z.boolean().refine((value) => value, msg('register.validation.consentRequired')),
  /** Hidden from people; bots fill it in. */
  website: z.string().max(500),
});

/** The server action's schema: the shift count is checked by the backend. */
export const publicRegistrationFormSchema = publicRegistrationBase;
export type PublicRegistrationFormValues = z.infer<typeof publicRegistrationBase>;

/** The form's schema: also asks for the event's number of shifts, for instant feedback. */
export function publicRegistrationFormSchemaFor(
  requiredShifts: number,
  commitment: 'shifts' | 'whole_event',
) {
  return publicRegistrationBase.superRefine((value, ctx) => {
    if (commitment === 'whole_event' && !value.wholeEvent) {
      ctx.addIssue({
        code: 'custom',
        message: msg('register.validation.wholeEventRequired'),
        path: ['wholeEvent'],
      });
    }
    if (
      commitment === 'shifts' &&
      !value.wholeEvent &&
      value.availableShiftIds.length < requiredShifts
    ) {
      ctx.addIssue({
        code: 'custom',
        message: msg('register.validation.pickShifts'),
        path: ['availableShiftIds'],
      });
    }
  });
}

export function toPublicRegistrationBody(values: PublicRegistrationFormValues): PublicRegistration {
  return {
    name: values.name,
    email: values.email,
    phone: values.phone || null,
    availableShiftIds: values.wholeEvent ? [] : values.availableShiftIds,
    wholeEvent: values.wholeEvent,
    preferredTeamId: values.preferredTeamId || null,
    notes: values.notes || null,
    consent: true,
    ...(values.website && { website: values.website }),
  };
}
