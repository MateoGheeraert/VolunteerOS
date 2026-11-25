import { z } from 'zod';
import { dateTimeOutput } from '../../common/schemas.js';
import {
  planningRuleKindEnum,
  planningRuleSourceEnum,
  type PlanningRuleKind,
} from '../../db/schema/index.js';

/**
 * API contracts for planning rules (docs/info.md §7.7.1 B): what the organizer knows about
 * volunteers that the allocation must respect. Not to be confused with planning-rules.ts, the
 * pure checks behind the board.
 */

export const PLANNING_RULE_KINDS = planningRuleKindEnum.enumValues;
export const TEAM_RULE_KINDS: readonly PlanningRuleKind[] = [
  'not_team',
  'only_team',
  'prefers_team',
];
export const PAIR_RULE_KINDS: readonly PlanningRuleKind[] = ['never_together', 'prefer_together'];
export const TIME_RULE_KINDS: readonly PlanningRuleKind[] = ['not_before', 'not_after'];
export const MAX_RULE_SHIFTS = 50;

/** `organization`: about the person, for every event. `event`: for this event only. */
export const ruleScopeSchema = z.enum(['organization', 'event']).meta({ id: 'PlanningRuleScope' });
export type RuleScope = z.infer<typeof ruleScopeSchema>;

const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'time: use HH:MM');

/**
 * One rule. The fields a kind doesn't use must be left out or null: a team for the team rules,
 * a second person for the pair rules, a number for `max_shifts`, a clock time for the time rules.
 */
export const createPlanningRuleSchema = z
  .object({
    kind: z.enum(PLANNING_RULE_KINDS),
    scope: ruleScopeSchema,
    volunteerId: z.uuid(),
    otherVolunteerId: z.uuid().nullable().optional(),
    teamName: z.string().trim().min(1).max(100).nullable().optional(),
    maxShifts: z.number().int().min(0).max(MAX_RULE_SHIFTS).nullable().optional(),
    time: clock.nullable().optional(),
  })
  .superRefine((rule, ctx) => {
    const has = {
      teamName: Boolean(rule.teamName),
      otherVolunteerId: Boolean(rule.otherVolunteerId),
      maxShifts: rule.maxShifts !== null && rule.maxShifts !== undefined,
      time: Boolean(rule.time),
    };
    const needs = {
      teamName: TEAM_RULE_KINDS.includes(rule.kind),
      otherVolunteerId: PAIR_RULE_KINDS.includes(rule.kind),
      maxShifts: rule.kind === 'max_shifts',
      time: TIME_RULE_KINDS.includes(rule.kind),
    };
    for (const field of Object.keys(needs) as (keyof typeof needs)[]) {
      if (needs[field] && !has[field]) {
        ctx.addIssue({
          code: 'custom',
          path: [field],
          message: `${field} is required for ${rule.kind}`,
        });
      }
      if (!needs[field] && has[field]) {
        ctx.addIssue({
          code: 'custom',
          path: [field],
          message: `${field} is not used by ${rule.kind}`,
        });
      }
    }
    if (rule.otherVolunteerId && rule.otherVolunteerId === rule.volunteerId) {
      ctx.addIssue({
        code: 'custom',
        path: ['otherVolunteerId'],
        message: 'otherVolunteerId: another person',
      });
    }
  })
  .meta({ id: 'CreatePlanningRule' });
export type CreatePlanningRuleInput = z.infer<typeof createPlanningRuleSchema>;

const personSchema = z.object({ id: z.uuid(), name: z.string() }).meta({ id: 'RulePerson' });

export const planningRuleSchema = z
  .object({
    id: z.uuid(),
    kind: z.enum(PLANNING_RULE_KINDS),
    scope: ruleScopeSchema,
    volunteer: personSchema,
    otherVolunteer: personSchema.nullable(),
    teamName: z.string().nullable(),
    maxShifts: z.number().int().nullable(),
    time: z.string().nullable(),
    source: z.enum(planningRuleSourceEnum.enumValues),
    /** Copied from the previous edition when this event was created. */
    copiedFromPreviousEdition: z.boolean(),
    createdAt: dateTimeOutput,
  })
  .meta({ id: 'PlanningRule' });
export type PlanningRuleDto = z.infer<typeof planningRuleSchema>;
