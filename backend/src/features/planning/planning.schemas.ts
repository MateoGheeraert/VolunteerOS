import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import { dateTimeInput, dateTimeOutput } from '../../common/schemas.js';
import {
  assignment,
  event,
  shift,
  team,
  volunteer,
  volunteerApplication,
} from '../../db/schema/index.js';

/**
 * API contracts for volunteer planning (teams, shifts, applications, assignments, publishing),
 * derived from the Drizzle tables like events.schemas.ts.
 */

const MAX_CAPACITY = 500;
const MAX_SHIFTS_PER_VOLUNTEER = 50;
/** More than any event has shifts; keeps a request small. */
const MAX_SHIFT_IDS = 500;

const endsAfterStart = (value: { startsAt?: Date; endsAt?: Date }) =>
  !value.startsAt || !value.endsAt || value.endsAt > value.startsAt;
const endsAfterStartIssue = { message: 'endsAt must be after startsAt', path: ['endsAt'] };

// ── Teams ──────────────────────────────────────────────────────────────────────────────────────

const teamInput = createInsertSchema(team, {
  name: (schema) => schema.trim().min(1).max(100),
  description: (schema) => schema.trim().max(2000),
  defaultMeetingPoint: (schema) => schema.trim().max(200),
});
const teamFields = { name: true, description: true, defaultMeetingPoint: true } as const;

export const createTeamSchema = teamInput.pick(teamFields).meta({ id: 'CreateTeam' });
export type CreateTeamInput = z.infer<typeof createTeamSchema>;

export const updateTeamSchema = teamInput.pick(teamFields).partial().meta({ id: 'UpdateTeam' });
export type UpdateTeamInput = z.infer<typeof updateTeamSchema>;

export const teamSchema = createSelectSchema(team, {
  createdAt: dateTimeOutput,
  updatedAt: dateTimeOutput,
})
  .omit({ deletedAt: true })
  .meta({ id: 'Team' });
export type TeamDto = z.infer<typeof teamSchema>;

// ── Shifts ─────────────────────────────────────────────────────────────────────────────────────

const shiftInput = createInsertSchema(shift, {
  meetingPoint: (schema) => schema.trim().max(200),
  startsAt: dateTimeInput,
  endsAt: dateTimeInput,
  capacity: (schema) => schema.int().min(1).max(MAX_CAPACITY),
});
const shiftFields = {
  teamId: true,
  meetingPoint: true,
  startsAt: true,
  endsAt: true,
  capacity: true,
} as const;

export const createShiftSchema = shiftInput
  .pick(shiftFields)
  .refine(endsAfterStart, endsAfterStartIssue)
  .meta({ id: 'CreateShift' });
export type CreateShiftInput = z.infer<typeof createShiftSchema>;

export const updateShiftSchema = shiftInput
  .pick(shiftFields)
  .partial()
  .refine(endsAfterStart, endsAfterStartIssue)
  .meta({ id: 'UpdateShift' });
export type UpdateShiftInput = z.infer<typeof updateShiftSchema>;

export const shiftSchema = createSelectSchema(shift, {
  startsAt: dateTimeOutput,
  endsAt: dateTimeOutput,
  createdAt: dateTimeOutput,
  updatedAt: dateTimeOutput,
})
  .omit({ deletedAt: true })
  .extend({
    /** People on the shift, proposed and confirmed. */
    assignedCount: z.number().int(),
    confirmedCount: z.number().int(),
  })
  .meta({ id: 'Shift' });
export type ShiftDto = z.infer<typeof shiftSchema>;

// ── Registration settings ──────────────────────────────────────────────────────────────────────

export const updateRegistrationSchema = createInsertSchema(event, {
  registrationDeadline: dateTimeInput.nullable(),
  shiftsPerVolunteer: (schema) => schema.int().min(1).max(MAX_SHIFTS_PER_VOLUNTEER),
})
  .pick({
    registrationOpen: true,
    registrationDeadline: true,
    volunteerCommitment: true,
    shiftsPerVolunteer: true,
  })
  .partial()
  .meta({ id: 'UpdateRegistration' });
export type UpdateRegistrationInput = z.infer<typeof updateRegistrationSchema>;

// ── Applications ───────────────────────────────────────────────────────────────────────────────

const volunteerInput = createInsertSchema(volunteer, {
  name: (schema) => schema.trim().min(1).max(200),
  email: () => z.string().trim().toLowerCase().max(320).pipe(z.email()),
  phone: (schema) => schema.trim().max(50),
});
const applicationInput = createInsertSchema(volunteerApplication, {
  availableShiftIds: () => z.array(z.uuid()).max(MAX_SHIFT_IDS),
  notes: (schema) => schema.trim().max(2000),
});
const applicationFields = {
  availableShiftIds: true,
  wholeEvent: true,
  preferredTeamId: true,
  notes: true,
} as const;

/** An organizer adds someone by hand: email is optional (not everyone uses it). */
export const createApplicationSchema = volunteerInput
  .pick({ name: true, email: true, phone: true })
  .extend(applicationInput.pick(applicationFields).shape)
  .meta({ id: 'CreateApplication' });
export type CreateApplicationInput = z.infer<typeof createApplicationSchema>;

export const updateApplicationSchema = createApplicationSchema
  .partial()
  .meta({ id: 'UpdateApplication' });
export type UpdateApplicationInput = z.infer<typeof updateApplicationSchema>;

/** A problem with one assignment, shown on the board. */
export const assignmentIssueSchema = z
  .enum(['over_capacity', 'not_available', 'overlap'])
  .meta({ id: 'AssignmentIssue' });
export type AssignmentIssue = z.infer<typeof assignmentIssueSchema>;

export const assignmentSchema = createSelectSchema(assignment, {
  createdAt: dateTimeOutput,
  updatedAt: dateTimeOutput,
})
  .omit({ deletedAt: true })
  .extend({ issues: z.array(assignmentIssueSchema) })
  .meta({ id: 'Assignment' });
export type AssignmentDto = z.infer<typeof assignmentSchema>;

/** What a volunteer should be told after the schedule was sent (see ScheduleService.notify). */
export const pendingNoticeSchema = z
  .enum(['schedule', 'updated', 'removed'])
  .meta({ id: 'PendingNotice' });

export const applicationSchema = createSelectSchema(volunteerApplication, {
  consentedAt: dateTimeOutput.nullable(),
  createdAt: dateTimeOutput,
  updatedAt: dateTimeOutput,
})
  // What was emailed is internal; the board shows whether something changed since.
  .omit({ deletedAt: true, notifiedSchedule: true })
  .extend(createSelectSchema(volunteer).pick({ name: true, email: true, phone: true }).shape)
  .extend({
    assignments: z.array(assignmentSchema),
    /**
     * After the schedule was sent: what this volunteer should be told about their changed
     * shifts (their schedule, an update, or that they're off); null when nothing changed.
     */
    pendingNotice: pendingNoticeSchema.nullable(),
    /** The volunteer holds emailed shifts: removing them needs them to be told first. */
    hasSentSchedule: z.boolean(),
  })
  .meta({ id: 'Application' });
export type ApplicationDto = z.infer<typeof applicationSchema>;

// ── Assignments ────────────────────────────────────────────────────────────────────────────────

/**
 * `acknowledgeWarnings`: the organizer confirmed the warnings (full shift, not marked as
 * available). Without it such a placement answers 409 with the warnings.
 */
export const createAssignmentSchema = z
  .object({
    applicationId: z.uuid(),
    shiftId: z.uuid(),
    acknowledgeWarnings: z.boolean().optional(),
  })
  .meta({ id: 'CreateAssignment' });
export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;

export const moveAssignmentSchema = z
  .object({ shiftId: z.uuid(), acknowledgeWarnings: z.boolean().optional() })
  .meta({ id: 'MoveAssignment' });
export type MoveAssignmentInput = z.infer<typeof moveAssignmentSchema>;

export const confirmAllResultSchema = z
  .object({ confirmed: z.number().int() })
  .meta({ id: 'ConfirmAllResult' });

// ── The board ──────────────────────────────────────────────────────────────────────────────────

export const registrationClosedReasonSchema = z
  .enum(['not_published', 'not_open', 'deadline_passed'])
  .meta({ id: 'RegistrationClosedReason' });

export const planningSchema = z
  .object({
    /** When shifts may happen: setup start (else event start) to teardown end (else event end). */
    window: z.object({ startsAt: dateTimeOutput, endsAt: dateTimeOutput }),
    teams: z.array(teamSchema),
    shifts: z.array(shiftSchema),
    applications: z.array(applicationSchema),
    /** Volunteers whose confirmed shifts differ from what they were emailed (after a first publish). */
    unpublishedChanges: z.number().int(),
    /** Why the public page takes no sign-ups right now; null while it does. */
    registrationClosedReason: registrationClosedReasonSchema.nullable(),
  })
  .meta({ id: 'Planning' });
export type PlanningDto = z.infer<typeof planningSchema>;

// ── Publishing ─────────────────────────────────────────────────────────────────────────────────

export const scheduleEntrySchema = z
  .object({
    shiftId: z.uuid(),
    teamName: z.string(),
    startsAt: dateTimeOutput,
    endsAt: dateTimeOutput,
    meetingPoint: z.string().nullable(),
  })
  .meta({ id: 'ScheduleEntry' });

export const scheduleNoticeKindSchema = z
  .enum(['schedule', 'updated', 'removed', 'not_needed'])
  .meta({ id: 'ScheduleNoticeKind' });

export const scheduleRecipientSchema = z
  .object({
    applicationId: z.uuid(),
    name: z.string(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
    kind: scheduleNoticeKindSchema,
    shifts: z.array(scheduleEntrySchema),
  })
  .meta({ id: 'ScheduleRecipient' });

/** What publishing now would send. `not_needed` recipients are only emailed when asked. */
export const schedulePreviewSchema = z
  .object({
    proposedCount: z.number().int(),
    recipients: z.array(scheduleRecipientSchema),
  })
  .meta({ id: 'SchedulePreview' });
export type SchedulePreviewDto = z.infer<typeof schedulePreviewSchema>;

export const publishScheduleSchema = z
  .object({
    /** Also email volunteers without a confirmed shift that they aren't needed this time. */
    includeNotNeeded: z.boolean(),
    /**
     * The organizer states everyone is assigned and nothing will change anymore. The schedule is
     * sent once; later changes are told per volunteer.
     */
    scheduleFinal: z.literal(true),
  })
  .meta({ id: 'PublishSchedule' });
export type PublishScheduleInput = z.infer<typeof publishScheduleSchema>;

export const publishResultSchema = z
  .object({
    sent: z.number().int(),
    failed: z.array(z.object({ applicationId: z.uuid(), name: z.string() })),
    /** Volunteers without an email address: the organizer contacts them. */
    withoutEmail: z.number().int(),
  })
  .meta({ id: 'PublishResult' });
export type PublishResultDto = z.infer<typeof publishResultSchema>;

/** One volunteer told about their changed shifts: by email, or by the organizer (no address). */
export const notifyResultSchema = z.object({ emailed: z.boolean() }).meta({ id: 'NotifyResult' });
export type NotifyResultDto = z.infer<typeof notifyResultSchema>;

// ── Public registration ────────────────────────────────────────────────────────────────────────

export const publicShiftSchema = z
  .object({
    id: z.uuid(),
    startsAt: dateTimeOutput,
    endsAt: dateTimeOutput,
    meetingPoint: z.string().nullable(),
  })
  .meta({ id: 'PublicShift' });

export const publicTeamSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    description: z.string().nullable(),
    shifts: z.array(publicShiftSchema),
  })
  .meta({ id: 'PublicTeam' });

/**
 * What the public page shows. Never anything about other volunteers, and no fill levels: under
 * managed allocation every shift is a wish the organizer weighs.
 */
export const publicEventSchema = z
  .object({
    name: z.string(),
    description: z.string().nullable(),
    location: z.string().nullable(),
    startsAt: dateTimeOutput,
    endsAt: dateTimeOutput,
    organizationName: z.string(),
    closedReason: registrationClosedReasonSchema.nullable(),
    registrationDeadline: dateTimeOutput.nullable(),
    volunteerCommitment: z.enum(['shifts', 'whole_event']),
    /** How many shifts the form asks for (never more than there are). */
    requiredShifts: z.number().int(),
    /** Empty while registration is closed. */
    teams: z.array(publicTeamSchema),
  })
  .meta({ id: 'PublicEvent' });
export type PublicEventDto = z.infer<typeof publicEventSchema>;

export const publicRegistrationSchema = volunteerInput
  .pick({ name: true, phone: true })
  .extend({
    email: z.string().trim().toLowerCase().max(320).pipe(z.email()),
    availableShiftIds: z.array(z.uuid()).max(MAX_SHIFT_IDS),
    wholeEvent: z.boolean(),
    preferredTeamId: z.uuid().nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
    consent: z.literal(true),
    /** A field people never see: bots fill it in. A filled-in one is accepted and dropped. */
    website: z.string().max(500).optional(),
  })
  .meta({ id: 'PublicRegistration' });
export type PublicRegistrationInput = z.infer<typeof publicRegistrationSchema>;
