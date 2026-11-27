import { z } from 'zod';
import type {
  AiSuggestion,
  CreatePlanningRule,
  PlanningRule,
  RuleDraft,
} from '@/api/generated/types.gen';

/**
 * Shapes for Mila on the planning page (docs/info.md §7.7.1), shared by the components and the
 * server actions. The backend validates everything again.
 */

export type TeamSuggestion = Extract<AiSuggestion, { kind: 'team_suggestion' }>;
export type ShiftChangeSuggestion = Extract<AiSuggestion, { kind: 'shift_change' }>;
export type RuleSuggestion = Extract<AiSuggestion, { kind: 'planning_rule' }>;
export type AllocationSuggestion = Extract<AiSuggestion, { kind: 'allocation' }>;
export type RuleKind = PlanningRule['kind'];

export const RULE_KINDS: RuleKind[] = [
  'not_team',
  'only_team',
  'prefers_team',
  'never_together',
  'prefer_together',
  'max_shifts',
  'not_before',
  'not_after',
];
export const TEAM_RULES: RuleKind[] = ['not_team', 'only_team', 'prefers_team'];
export const PAIR_RULES: RuleKind[] = ['never_together', 'prefer_together'];
export const TIME_RULES: RuleKind[] = ['not_before', 'not_after'];
/** Soft rules weigh; the others the allocation never breaks. */
export const SOFT_RULES: RuleKind[] = ['prefers_team', 'prefer_together'];

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export const ruleSchema = z.object({
  kind: z.enum(RULE_KINDS as [RuleKind, ...RuleKind[]]),
  scope: z.enum(['organization', 'event']),
  volunteerId: z.uuid(),
  otherVolunteerId: z.uuid().nullable().optional(),
  teamName: z.string().trim().min(1).max(100).nullable().optional(),
  maxShifts: z.number().int().min(0).max(50).nullable().optional(),
  time: z.string().regex(TIME).nullable().optional(),
});

/**
 * A rule as the API takes it: only the field its kind uses, or null when it is incomplete (no
 * person picked yet, no team, an invalid time).
 */
export function toRuleBody(rule: {
  kind: RuleKind;
  scope: 'organization' | 'event';
  volunteerId: string | null;
  otherVolunteerId?: string | null;
  teamName?: string | null;
  maxShifts?: number | null;
  time?: string | null;
}): CreatePlanningRule | null {
  if (!rule.volunteerId) return null;
  const body: CreatePlanningRule = {
    kind: rule.kind,
    scope: rule.scope,
    volunteerId: rule.volunteerId,
  };
  if (TEAM_RULES.includes(rule.kind)) {
    const team = rule.teamName?.trim();
    if (!team) return null;
    body.teamName = team;
  } else if (PAIR_RULES.includes(rule.kind)) {
    if (!rule.otherVolunteerId || rule.otherVolunteerId === rule.volunteerId) return null;
    body.otherVolunteerId = rule.otherVolunteerId;
  } else if (rule.kind === 'max_shifts') {
    if (rule.maxShifts === null || rule.maxShifts === undefined || rule.maxShifts < 0) return null;
    body.maxShifts = rule.maxShifts;
  } else {
    if (!rule.time || !TIME.test(rule.time)) return null;
    body.time = rule.time;
  }
  return body;
}

/** A chip or card as the organizer set it (person picked, scope chosen) as an API rule. */
export const draftToRuleBody = (
  draft: Pick<RuleDraft, 'kind' | 'scope' | 'teamName' | 'maxShifts' | 'time'> & {
    personId: string | null;
    otherId: string | null;
  },
) =>
  toRuleBody({
    kind: draft.kind,
    scope: draft.scope,
    volunteerId: draft.personId,
    otherVolunteerId: draft.otherId,
    teamName: draft.teamName,
    maxShifts: draft.maxShifts,
    time: draft.time,
  });

export const ruleTextSchema = z.object({ text: z.string().trim().min(1).max(2000) });

export const createRulesSchema = z.object({ rules: z.array(ruleSchema).min(1).max(30) });

const isoDateTime = z.iso.datetime({ offset: true });

export const acceptTeamsSchema = z.object({
  items: z
    .array(
      z.object({
        suggestionId: z.uuid(),
        team: z.object({
          name: z.string().trim().min(1).max(100),
          description: z.string().trim().max(2000),
          defaultMeetingPoint: z.string().trim().max(200),
        }),
        shifts: z
          .array(
            z.object({
              startsAt: isoDateTime,
              endsAt: isoDateTime,
              capacity: z.number().int().min(1).max(500),
            }),
          )
          .max(20),
      }),
    )
    .min(1)
    .max(10),
});
export type AcceptTeamsInput = z.infer<typeof acceptTeamsSchema>;

/** A team card taken over as Mila suggested it. */
export const teamAsIs = (suggestion: TeamSuggestion): AcceptTeamsInput['items'][number] => ({
  suggestionId: suggestion.id,
  team: {
    name: suggestion.payload.name,
    description: suggestion.payload.description ?? '',
    defaultMeetingPoint: suggestion.payload.defaultMeetingPoint ?? '',
  },
  shifts: suggestion.payload.shifts.map(({ startsAt, endsAt, capacity }) => ({
    startsAt,
    endsAt,
    capacity,
  })),
});

export const placementsSchema = z.object({
  placements: z
    .array(z.object({ applicationId: z.uuid(), shiftId: z.uuid() }))
    .min(1)
    .max(500),
});
export type PlacementRef = { applicationId: string; shiftId: string };
