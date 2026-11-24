'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  budgetControllerCreate,
  budgetControllerRemove,
  budgetControllerUpdate,
} from '@/api/generated';
import {
  budgetApiFields,
  budgetEntryFormSchema,
  toBudgetEntryBody,
} from '@/features/budget/schemas';
import { MAX_LABELS_PER_ITEM } from '@/features/labels/schemas';
import { actionClient } from '../action-client';

const id = z.uuid();

/** Budget entries show on the budget, and their files on the event's file tab. */
function revalidateBudget(eventId: string) {
  revalidatePath(`/events/${eventId}/budget`);
  revalidatePath(`/events/${eventId}/files`);
}

/** Bind the event. */
export const createBudgetEntry = actionClient
  .metadata({ name: 'createBudgetEntry', apiFields: budgetApiFields })
  .bindArgsSchemas([id])
  .inputSchema(budgetEntryFormSchema)
  .action(async ({ parsedInput, bindArgsParsedInputs: [eventId] }) => {
    const { data } = await budgetControllerCreate({
      path: { eventId },
      body: toBudgetEntryBody(parsedInput),
    });
    revalidateBudget(eventId);
    return { id: data.id };
  });

/** Saves the whole form over the entry (bind event and entry). */
export const updateBudgetEntry = actionClient
  .metadata({ name: 'updateBudgetEntry', apiFields: budgetApiFields })
  .bindArgsSchemas([id, id])
  .inputSchema(budgetEntryFormSchema)
  .action(async ({ parsedInput, bindArgsParsedInputs: [eventId, entryId] }) => {
    await budgetControllerUpdate({
      path: { eventId, entryId },
      body: toBudgetEntryBody(parsedInput),
    });
    revalidateBudget(eventId);
    return { id: entryId };
  });

export const deleteBudgetEntry = actionClient
  .metadata({ name: 'deleteBudgetEntry' })
  .bindArgsSchemas([id, id])
  .action(async ({ bindArgsParsedInputs: [eventId, entryId] }) => {
    await budgetControllerRemove({ path: { eventId, entryId } });
    revalidateBudget(eventId);
  });

/** Tags the entry from the list: replaces its labels, nothing else (bind event and entry). */
export const setBudgetEntryLabels = actionClient
  .metadata({ name: 'setBudgetEntryLabels' })
  .bindArgsSchemas([id, id])
  .inputSchema(z.object({ labelIds: z.array(z.uuid()).max(MAX_LABELS_PER_ITEM) }))
  .action(async ({ parsedInput, bindArgsParsedInputs: [eventId, entryId] }) => {
    await budgetControllerUpdate({ path: { eventId, entryId }, body: parsedInput });
    revalidateBudget(eventId);
  });
