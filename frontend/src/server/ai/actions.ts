'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  aiEventControllerAcceptBudgetLines,
  aiEventControllerAcceptEventUpdate,
  aiEventControllerAcceptTasks,
  aiEventControllerAnswer,
  aiEventControllerCreateDraftTasks,
  aiEventControllerDraftTasks,
  aiEventControllerMarkSeen,
  aiEventControllerReject,
  aiEventControllerRequestBudgetReview,
  aiEventControllerRequestTaskSuggestions,
  aiOrganizationControllerRemoveMemory,
} from '@/api/generated';
import {
  acceptAsIsSchema,
  acceptBudgetLinesAsIsSchema,
  answerSchema,
  createDraftTasksSchema,
  draftTextSchema,
  eventUpdateSchema,
} from '@/features/ai/schemas';
import {
  budgetApiFields,
  budgetEntryFormSchema,
  toBudgetEntryBody,
} from '@/features/budget/schemas';
import { taskApiFields, taskFormSchema, toTaskBody } from '@/features/tasks/schemas';
import { msg } from '@/i18n/keys';
import { actionClient } from '../action-client';

const id = z.uuid();

/** Suggestions change tasks and event fields: refresh every page that shows them. */
function revalidateEvent(eventId: string) {
  revalidatePath(`/events/${eventId}`, 'layout');
  revalidatePath('/tasks');
}

/** Accepted budget lines also show on their supplier's pages. */
function revalidateBudget(eventId: string) {
  revalidatePath(`/events/${eventId}`, 'layout');
  revalidatePath('/suppliers', 'layout');
}

const handled = msg('ai.alreadyHandled');

/** Bind the event. */
export const requestTaskSuggestions = actionClient
  .metadata({ name: 'requestTaskSuggestions', conflictMessage: msg('ai.unavailable') })
  .bindArgsSchemas([id])
  .action(async ({ bindArgsParsedInputs: [eventId] }) => {
    await aiEventControllerRequestTaskSuggestions({ path: { eventId } });
    revalidateEvent(eventId);
  });

/** "Mila, bekijk mijn begroting". Bind the event. */
export const requestBudgetReview = actionClient
  .metadata({ name: 'requestBudgetReview', conflictMessage: msg('ai.unavailable') })
  .bindArgsSchemas([id])
  .inputSchema(z.object({ instruction: z.string().trim().max(500) }))
  .action(async ({ parsedInput, bindArgsParsedInputs: [eventId] }) => {
    await aiEventControllerRequestBudgetReview({
      path: { eventId },
      body: { instruction: parsedInput.instruction || undefined },
    });
    revalidateEvent(eventId);
  });

/** One budget line, as edited in the budget line form. Bind the event and the suggestion. */
export const acceptBudgetLine = actionClient
  .metadata({ name: 'acceptBudgetLine', apiFields: budgetApiFields, conflictMessage: handled })
  .bindArgsSchemas([id, id])
  .inputSchema(budgetEntryFormSchema)
  .action(async ({ parsedInput, bindArgsParsedInputs: [eventId, suggestionId] }) => {
    await aiEventControllerAcceptBudgetLines({
      path: { eventId },
      body: { items: [{ suggestionId, entry: toBudgetEntryBody(parsedInput) }] },
    });
    revalidateBudget(eventId);
    return { id: suggestionId };
  });

/** Several budget lines at once, as proposed. Bind the event. */
export const acceptBudgetLinesAsIs = actionClient
  .metadata({ name: 'acceptBudgetLinesAsIs', conflictMessage: handled })
  .bindArgsSchemas([id])
  .inputSchema(acceptBudgetLinesAsIsSchema)
  .action(async ({ parsedInput, bindArgsParsedInputs: [eventId] }) => {
    await aiEventControllerAcceptBudgetLines({
      path: { eventId },
      body: {
        items: parsedInput.items.map(({ suggestionId, ...entry }) => ({ suggestionId, entry })),
      },
    });
    revalidateBudget(eventId);
  });

/** One task suggestion, as edited in the task dialog. Bind the event and the suggestion. */
export const acceptTaskSuggestion = actionClient
  .metadata({ name: 'acceptTaskSuggestion', apiFields: taskApiFields, conflictMessage: handled })
  .bindArgsSchemas([id, id])
  .inputSchema(taskFormSchema)
  .action(async ({ parsedInput, bindArgsParsedInputs: [eventId, suggestionId] }) => {
    await aiEventControllerAcceptTasks({
      path: { eventId },
      body: { items: [{ suggestionId, task: toTaskBody(parsedInput) }] },
    });
    revalidateEvent(eventId);
  });

/** Several task suggestions at once, as suggested. Bind the event. */
export const acceptTaskSuggestionsAsIs = actionClient
  .metadata({ name: 'acceptTaskSuggestionsAsIs', conflictMessage: handled })
  .bindArgsSchemas([id])
  .inputSchema(acceptAsIsSchema)
  .action(async ({ parsedInput, bindArgsParsedInputs: [eventId] }) => {
    await aiEventControllerAcceptTasks({
      path: { eventId },
      body: {
        items: parsedInput.items.map(({ suggestionId, title, description, priority, dueDate }) => ({
          suggestionId,
          task: { title, description, priority, dueDate },
        })),
      },
    });
    revalidateEvent(eventId);
  });

/** Bind the event and the suggestion. */
export const acceptEventUpdate = actionClient
  .metadata({ name: 'acceptEventUpdate', conflictMessage: handled })
  .bindArgsSchemas([id, id])
  .inputSchema(eventUpdateSchema)
  .action(async ({ parsedInput, bindArgsParsedInputs: [eventId, suggestionId] }) => {
    await aiEventControllerAcceptEventUpdate({
      path: { eventId, suggestionId },
      body: { value: parsedInput.value },
    });
    revalidateEvent(eventId);
  });

/** Bind the event and the question. */
export const answerQuestion = actionClient
  .metadata({ name: 'answerQuestion', conflictMessage: handled })
  .bindArgsSchemas([id, id])
  .inputSchema(answerSchema)
  .action(async ({ parsedInput, bindArgsParsedInputs: [eventId, suggestionId] }) => {
    await aiEventControllerAnswer({ path: { eventId, suggestionId }, body: parsedInput });
    revalidateEvent(eventId);
  });

/** "Niet nodig" on a suggestion, "Overslaan" on a question. Bind the event and the suggestion. */
export const rejectSuggestion = actionClient
  .metadata({ name: 'rejectSuggestion', conflictMessage: handled })
  .bindArgsSchemas([id, id])
  .action(async ({ bindArgsParsedInputs: [eventId, suggestionId] }) => {
    await aiEventControllerReject({ path: { eventId, suggestionId } });
    revalidateEvent(eventId);
  });

/** The cards were on screen: for the pilot metric "shown". Bind the event. */
export const markSuggestionsSeen = actionClient
  .metadata({ name: 'markSuggestionsSeen' })
  .bindArgsSchemas([id])
  .inputSchema(z.object({ suggestionIds: z.array(id).min(1).max(100) }))
  .action(async ({ parsedInput, bindArgsParsedInputs: [eventId] }) => {
    await aiEventControllerMarkSeen({ path: { eventId }, body: parsedInput });
  });

/** Bind the memory. */
export const deleteAiMemory = actionClient
  .metadata({ name: 'deleteAiMemory' })
  .bindArgsSchemas([id])
  .action(async ({ bindArgsParsedInputs: [memoryId] }) => {
    await aiOrganizationControllerRemoveMemory({ path: { memoryId } });
    revalidatePath('/settings/ai');
  });

/** Mila turns the organizer's list into tasks to check. Bind the event. */
export const draftTasks = actionClient
  .metadata({ name: 'draftTasks', conflictMessage: msg('ai.unavailable') })
  .bindArgsSchemas([id])
  .inputSchema(draftTextSchema)
  .action(async ({ parsedInput, bindArgsParsedInputs: [eventId] }) => {
    const { data } = await aiEventControllerDraftTasks({ path: { eventId }, body: parsedInput });
    return data;
  });

/** Creates the drafted tasks the organizer kept. Bind the event and the drafting run. */
export const createDraftTasks = actionClient
  .metadata({ name: 'createDraftTasks' })
  .bindArgsSchemas([id, id])
  .inputSchema(createDraftTasksSchema)
  .action(async ({ parsedInput, bindArgsParsedInputs: [eventId, runId] }) => {
    await aiEventControllerCreateDraftTasks({ path: { eventId, runId }, body: parsedInput });
    revalidateEvent(eventId);
  });
