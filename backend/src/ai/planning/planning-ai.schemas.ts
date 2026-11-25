import { z } from 'zod';
import { createTeamSchema } from '../../features/planning/planning.schemas.js';
import { createPlanningRuleSchema } from '../../features/planning/planning-rule.schemas.js';
import { ruleDraftSchema } from './planning-payloads.js';

/** API contracts for Mila on the planning page (docs/info.md §7.7.1). */

/** "Stel teams en shiften voor", with what the organizer asks for (empty: Mila decides). */
export const requestShiftSuggestionsSchema = z
  .object({ instruction: z.string().trim().max(500).optional() })
  .meta({ id: 'RequestShiftSuggestions' });
export type RequestShiftSuggestionsInput = z.infer<typeof requestShiftSuggestionsSchema>;

/** "Vertel Mila iets over de planning". */
export const draftRulesSchema = z
  .object({ text: z.string().trim().min(1).max(2000) })
  .meta({ id: 'DraftRules' });
export type DraftRulesInput = z.infer<typeof draftRulesSchema>;

export const ruleDraftResultSchema = z
  .object({
    /** The drafting run: saving the rules refers to it, the log keeps it as their source. */
    runId: z.uuid(),
    rules: z.array(ruleDraftSchema),
    /** Names Mila couldn't match to anyone on the event. */
    unknownNames: z.array(z.string()),
  })
  .meta({ id: 'RuleDraftResult' });
export type RuleDraftResultDto = z.infer<typeof ruleDraftResultSchema>;

export const createRulesFromDraftSchema = z
  .object({ rules: z.array(createPlanningRuleSchema).min(1).max(30) })
  .meta({ id: 'CreateRulesFromDraft' });
export type CreateRulesFromDraftInput = z.infer<typeof createRulesFromDraftSchema>;

/** Accepting team cards: each team (as edited) with the shifts the organizer kept. */
export const acceptTeamSuggestionsSchema = z
  .object({
    items: z
      .array(
        z.object({
          suggestionId: z.uuid(),
          team: createTeamSchema,
          shifts: z
            .array(
              z.object({
                startsAt: z.iso.datetime({ offset: true }),
                endsAt: z.iso.datetime({ offset: true }),
                capacity: z.number().int().min(1).max(500),
              }),
            )
            .max(20),
        }),
      )
      .min(1)
      .max(10),
  })
  .meta({ id: 'AcceptTeamSuggestions' });
export type AcceptTeamSuggestionsInput = z.infer<typeof acceptTeamSuggestionsSchema>;

/** Accepting a shift change, optionally with another capacity. */
export const acceptShiftChangeSchema = z
  .object({ capacity: z.number().int().min(1).max(500).optional() })
  .meta({ id: 'AcceptShiftChange' });
export type AcceptShiftChangeInput = z.infer<typeof acceptShiftChangeSchema>;

/** Accepting a rule read from a note: as the organizer set it (person picked, scope). */
export const acceptRuleSuggestionSchema = z
  .object({ rule: createPlanningRuleSchema })
  .meta({ id: 'AcceptRuleSuggestion' });
export type AcceptRuleSuggestionInput = z.infer<typeof acceptRuleSuggestionSchema>;

const placementRef = z.object({ applicationId: z.uuid(), shiftId: z.uuid() });

/** Taking over (or dropping) some of the allocation's placements: all, a shift's, a person's. */
export const placementsSchema = z
  .object({ placements: z.array(placementRef).min(1).max(500) })
  .meta({ id: 'AllocationPlacements' });
export type PlacementsInput = z.infer<typeof placementsSchema>;

export const acceptPlacementsResultSchema = z
  .object({
    placed: z.number().int(),
    /** No longer possible (the board changed): left out. */
    skipped: z.number().int(),
  })
  .meta({ id: 'AcceptPlacementsResult' });
export type AcceptPlacementsResultDto = z.infer<typeof acceptPlacementsResultSchema>;
