import { z } from 'zod';
import { planningRuleKindEnum } from '../../db/schema/index.js';

/**
 * Payloads of Mila's planning cards (docs/info.md §7.7.1), stored in `ai_suggestion.payload` and
 * validated on every write and read, like the shapes in ai.types.ts.
 */

const isoDateTime = z.iso.datetime({ offset: true });

/**
 * The times the organizer or Mila asked for, when they ran past the event's hours and the shift
 * was cut to them; absent or null when the shift is as asked.
 */
const requestedTimes = z.object({ startsAt: isoDateTime, endsAt: isoDateTime }).nullish();

/** `team_suggestion`: a new team with its shifts. */
export const teamSuggestionPayloadSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(2000).nullable(),
  defaultMeetingPoint: z.string().max(200).nullable(),
  shifts: z
    .array(
      z.object({
        startsAt: isoDateTime,
        endsAt: isoDateTime,
        capacity: z.number().int().min(1).max(500),
        requested: requestedTimes,
      }),
    )
    .min(1)
    .max(8),
});
export type TeamSuggestionPayload = z.infer<typeof teamSuggestionPayloadSchema>;

/**
 * `shift_change` on an existing team: an extra shift (`add_shift`) or another capacity for one
 * (`capacity`, with `shiftId` and the capacity it has now).
 */
export const shiftChangePayloadSchema = z.object({
  type: z.enum(['add_shift', 'capacity']),
  teamId: z.uuid(),
  teamName: z.string(),
  shiftId: z.uuid().nullable(),
  startsAt: isoDateTime,
  endsAt: isoDateTime,
  fromCapacity: z.number().int().nullable(),
  capacity: z.number().int().min(1).max(500),
  requested: requestedTimes,
});
export type ShiftChangePayload = z.infer<typeof shiftChangePayloadSchema>;

/**
 * Who a rule is about, as Mila understood the name. `volunteerId` set: resolved. Null with
 * candidates: the name fits several people and the organizer picks one.
 */
export const personPickSchema = z
  .object({
    name: z.string(),
    volunteerId: z.uuid().nullable(),
    candidates: z.array(z.object({ volunteerId: z.uuid(), name: z.string() })),
  })
  .meta({ id: 'RulePersonPick' });
export type PersonPick = z.infer<typeof personPickSchema>;

/** A rule Mila read, before the organizer confirms it: a chip, or a card from a note. */
export const ruleDraftSchema = z
  .object({
    kind: z.enum(planningRuleKindEnum.enumValues),
    scope: z.enum(['organization', 'event']),
    person: personPickSchema,
    other: personPickSchema.nullable(),
    teamName: z.string().nullable(),
    maxShifts: z.number().int().nullable(),
    time: z.string().nullable(),
    /** The words it was read from. */
    quote: z.string(),
  })
  .meta({ id: 'RuleDraft' });
export type RuleDraft = z.infer<typeof ruleDraftSchema>;

/** `planning_rule`: a rule read from a volunteer's note. */
export const planningRulePayloadSchema = ruleDraftSchema.extend({ applicationId: z.uuid() });
export type PlanningRulePayload = z.infer<typeof planningRulePayloadSchema>;

export const placementSchema = z
  .object({
    applicationId: z.uuid(),
    shiftId: z.uuid(),
    reasons: z.array(z.enum(['preferred_team', 'prefers_team', 'together', 'previous_team'])),
  })
  .meta({ id: 'AllocationPlacement' });

/** `allocation`: the solver's proposal, minus the placements already taken over or dropped. */
export const allocationPayloadSchema = z.object({
  placements: z.array(placementSchema),
  gaps: z.array(
    z
      .object({
        shiftId: z.uuid(),
        missing: z.number().int(),
        reason: z.enum(['nobody_available', 'busy', 'max_shifts', 'rules']),
      })
      .meta({ id: 'AllocationGap' }),
  ),
  unplaced: z.array(
    z
      .object({
        applicationId: z.uuid(),
        missing: z.number().int(),
        reason: z.enum(['no_shifts_marked', 'shifts_full', 'busy', 'rules']),
      })
      .meta({ id: 'AllocationUnplaced' }),
  ),
  /** Placements proposed in total, and taken over so far. */
  proposed: z.number().int(),
  accepted: z.number().int(),
  /** Rules the solver applied, and how many of them Mila read from notes in this run. */
  rulesApplied: z.number().int(),
  rulesFromNotes: z.number().int(),
});
export type AllocationPayload = z.infer<typeof allocationPayloadSchema>;
