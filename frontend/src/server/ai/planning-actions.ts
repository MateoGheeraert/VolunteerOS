'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  planningAiControllerAcceptPlacements,
  planningAiControllerAcceptRule,
  planningAiControllerAcceptShiftChange,
  planningAiControllerAcceptTeams,
  planningAiControllerCreateDraftRules,
  planningAiControllerDiscardPlacements,
  planningAiControllerDraftRules,
  planningAiControllerRequestAllocation,
  planningAiControllerRequestShiftSuggestions,
  planningRuleControllerCreate,
  planningRuleControllerRemove,
  planningRuleControllerUpdate,
} from '@/api/generated';
import {
  acceptTeamsSchema,
  createRulesSchema,
  placementsSchema,
  ruleSchema,
  ruleTextSchema,
} from '@/features/ai/planning/schemas';
import { msg } from '@/i18n/keys';
import { actionClient } from '../action-client';

/** Mila on the planning page (docs/info.md §7.7.1) and the planning rules. */

const id = z.uuid();
const handled = msg('ai.alreadyHandled');

/** The planning, the overview's planning card and Mila's state all change. */
const revalidateEvent = (eventId: string) => revalidatePath(`/events/${eventId}`, 'layout');

/** "Stel teams en shiften voor", with what the organizer asks for (empty: Mila decides). Bind the event. */
export const requestShiftSuggestions = actionClient
  .metadata({ name: 'requestShiftSuggestions', conflictMessage: msg('ai.unavailable') })
  .bindArgsSchemas([id])
  .inputSchema(z.object({ instruction: z.string().trim().max(500) }))
  .action(async ({ parsedInput, bindArgsParsedInputs: [eventId] }) => {
    await planningAiControllerRequestShiftSuggestions({
      path: { eventId },
      body: { instruction: parsedInput.instruction || undefined },
    });
    revalidateEvent(eventId);
  });

/** "Laat Mila verdelen". Bind the event. */
export const requestAllocation = actionClient
  .metadata({ name: 'requestAllocation', conflictMessage: msg('ai.unavailable') })
  .bindArgsSchemas([id])
  .action(async ({ bindArgsParsedInputs: [eventId] }) => {
    await planningAiControllerRequestAllocation({ path: { eventId } });
    revalidateEvent(eventId);
  });

/** "Vertel Mila iets over de planning": rule chips to check. Bind the event. */
export const draftRules = actionClient
  .metadata({ name: 'draftRules', conflictMessage: msg('ai.unavailable') })
  .bindArgsSchemas([id])
  .inputSchema(ruleTextSchema)
  .action(async ({ parsedInput, bindArgsParsedInputs: [eventId] }) => {
    const { data } = await planningAiControllerDraftRules({ path: { eventId }, body: parsedInput });
    return data;
  });

/** Saves the chips the organizer kept. Bind the event and the drafting run. */
export const createDraftRules = actionClient
  .metadata({ name: 'createDraftRules', conflictMessage: msg('milaPlanning.rules.duplicate') })
  .bindArgsSchemas([id, id])
  .inputSchema(createRulesSchema)
  .action(async ({ parsedInput, bindArgsParsedInputs: [eventId, runId] }) => {
    await planningAiControllerCreateDraftRules({ path: { eventId, runId }, body: parsedInput });
    revalidateEvent(eventId);
  });

/** Team cards, as edited or as suggested. Bind the event. */
export const acceptTeamSuggestions = actionClient
  .metadata({ name: 'acceptTeamSuggestions', conflictMessage: handled })
  .bindArgsSchemas([id])
  .inputSchema(acceptTeamsSchema)
  .action(async ({ parsedInput, bindArgsParsedInputs: [eventId] }) => {
    await planningAiControllerAcceptTeams({
      path: { eventId },
      body: {
        items: parsedInput.items.map((item) => ({
          ...item,
          team: {
            name: item.team.name,
            description: item.team.description || null,
            defaultMeetingPoint: item.team.defaultMeetingPoint || null,
          },
        })),
      },
    });
    revalidateEvent(eventId);
  });

/** Bind the event and the card. */
export const acceptShiftChange = actionClient
  .metadata({ name: 'acceptShiftChange', conflictMessage: handled })
  .bindArgsSchemas([id, id])
  .inputSchema(z.object({ capacity: z.number().int().min(1).max(500).optional() }))
  .action(async ({ parsedInput, bindArgsParsedInputs: [eventId, suggestionId] }) => {
    await planningAiControllerAcceptShiftChange({
      path: { eventId, suggestionId },
      body: parsedInput,
    });
    revalidateEvent(eventId);
  });

/** A rule read from a note, as the organizer set it. Bind the event and the card. */
export const acceptRuleSuggestion = actionClient
  .metadata({ name: 'acceptRuleSuggestion', conflictMessage: handled })
  .bindArgsSchemas([id, id])
  .inputSchema(z.object({ rule: ruleSchema }))
  .action(async ({ parsedInput, bindArgsParsedInputs: [eventId, suggestionId] }) => {
    await planningAiControllerAcceptRule({ path: { eventId, suggestionId }, body: parsedInput });
    revalidateEvent(eventId);
  });

/** Takes over placements of the proposal. Bind the event and the proposal. */
export const acceptPlacements = actionClient
  .metadata({ name: 'acceptPlacements', conflictMessage: handled })
  .bindArgsSchemas([id, id])
  .inputSchema(placementsSchema)
  .action(async ({ parsedInput, bindArgsParsedInputs: [eventId, suggestionId] }) => {
    const { data } = await planningAiControllerAcceptPlacements({
      path: { eventId, suggestionId },
      body: parsedInput,
    });
    revalidateEvent(eventId);
    return data;
  });

/** Drops placements from the proposal. Bind the event and the proposal. */
export const discardPlacements = actionClient
  .metadata({ name: 'discardPlacements', conflictMessage: handled })
  .bindArgsSchemas([id, id])
  .inputSchema(placementsSchema)
  .action(async ({ parsedInput, bindArgsParsedInputs: [eventId, suggestionId] }) => {
    await planningAiControllerDiscardPlacements({
      path: { eventId, suggestionId },
      body: parsedInput,
    });
    revalidateEvent(eventId);
  });

// ── Rules ──────────────────────────────────────────────────────────────────────────────────────

/** Bind the event. */
export const createPlanningRule = actionClient
  .metadata({ name: 'createPlanningRule', conflictMessage: msg('milaPlanning.rules.duplicate') })
  .bindArgsSchemas([id])
  .inputSchema(ruleSchema)
  .action(async ({ parsedInput, bindArgsParsedInputs: [eventId] }) => {
    await planningRuleControllerCreate({ path: { eventId }, body: parsedInput });
    revalidateEvent(eventId);
  });

/** Bind the event and the rule. */
export const updatePlanningRule = actionClient
  .metadata({ name: 'updatePlanningRule', conflictMessage: msg('milaPlanning.rules.duplicate') })
  .bindArgsSchemas([id, id])
  .inputSchema(ruleSchema)
  .action(async ({ parsedInput, bindArgsParsedInputs: [eventId, ruleId] }) => {
    await planningRuleControllerUpdate({ path: { eventId, ruleId }, body: parsedInput });
    revalidateEvent(eventId);
  });

/** Bind the event and the rule. */
export const deletePlanningRule = actionClient
  .metadata({ name: 'deletePlanningRule' })
  .bindArgsSchemas([id, id])
  .action(async ({ bindArgsParsedInputs: [eventId, ruleId] }) => {
    await planningRuleControllerRemove({ path: { eventId, ruleId } });
    revalidateEvent(eventId);
  });
