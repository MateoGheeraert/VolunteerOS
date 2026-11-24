'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  labelsControllerCreate,
  labelsControllerRemove,
  labelsControllerUpdate,
  labelsControllerUsage,
} from '@/api/generated';
import { labelFormSchema } from '@/features/labels/schemas';
import { msg } from '@/i18n/keys';
import { actionClient } from '../action-client';

const id = z.uuid();

/** Labels show on the event's tasks, "my tasks" and the budget. */
function revalidateLabels(eventId: string) {
  revalidatePath(`/events/${eventId}/tasks`);
  revalidatePath(`/events/${eventId}/budget`);
  revalidatePath('/tasks');
}

/** Bind the event. Returns the label, so a form can select it right away. */
export const createLabel = actionClient
  .metadata({ name: 'createLabel', conflictMessage: msg('labels.nameTaken') })
  .bindArgsSchemas([id])
  .inputSchema(labelFormSchema)
  .action(async ({ parsedInput, bindArgsParsedInputs: [eventId] }) => {
    const { data } = await labelsControllerCreate({ path: { eventId }, body: parsedInput });
    revalidateLabels(eventId);
    return data;
  });

export const updateLabel = actionClient
  .metadata({ name: 'updateLabel', conflictMessage: msg('labels.nameTaken') })
  .bindArgsSchemas([id, id])
  .inputSchema(labelFormSchema)
  .action(async ({ parsedInput, bindArgsParsedInputs: [eventId, labelId] }) => {
    await labelsControllerUpdate({ path: { eventId, labelId }, body: parsedInput });
    revalidateLabels(eventId);
  });

/** How many tasks and budget entries carry the label: asked for before deleting it. */
export const getLabelUsage = actionClient
  .metadata({ name: 'getLabelUsage' })
  .bindArgsSchemas([id, id])
  .action(async ({ bindArgsParsedInputs: [eventId, labelId] }) => {
    const { data } = await labelsControllerUsage({ path: { eventId, labelId } });
    return data;
  });

export const deleteLabel = actionClient
  .metadata({ name: 'deleteLabel' })
  .bindArgsSchemas([id, id])
  .action(async ({ bindArgsParsedInputs: [eventId, labelId] }) => {
    await labelsControllerRemove({ path: { eventId, labelId } });
    revalidateLabels(eventId);
  });
