'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  promotionControllerCreateTask,
  promotionControllerUpdateAudience,
  promotionPlanControllerAccept,
  promotionPlanControllerRequest,
} from '@/api/generated';
import {
  acceptPromoAsIsSchema,
  audienceApiFields,
  audienceFormSchema,
  requestPlanSchema,
  toAudienceBody,
} from '@/features/promotion/schemas';
import { taskApiFields, taskFormSchema, toTaskBody } from '@/features/tasks/schemas';
import { msg } from '@/i18n/keys';
import { actionClient } from '../action-client';

const id = z.uuid();

/** Accepted actions become tasks, labels and budget lines: refresh every page of the event. */
function revalidateEvent(eventId: string) {
  revalidatePath(`/events/${eventId}`, 'layout');
  revalidatePath('/tasks');
}

/** Saves the whole Publiek. Bind the event. */
export const updateAudience = actionClient
  .metadata({ name: 'updateAudience', apiFields: audienceApiFields })
  .bindArgsSchemas([id])
  .inputSchema(audienceFormSchema)
  .action(async ({ parsedInput, bindArgsParsedInputs: [eventId] }) => {
    await promotionControllerUpdateAudience({
      path: { eventId },
      body: toAudienceBody(parsedInput),
    });
    revalidatePath(`/events/${eventId}`, 'layout');
  });

/** The organizer's own promotion action: a task labelled Promotie. Bind the event. */
export const createPromotionTask = actionClient
  .metadata({ name: 'createPromotionTask', apiFields: taskApiFields })
  .bindArgsSchemas([id])
  .inputSchema(taskFormSchema)
  .action(async ({ parsedInput, bindArgsParsedInputs: [eventId] }) => {
    await promotionControllerCreateTask({ path: { eventId }, body: toTaskBody(parsedInput) });
    revalidateEvent(eventId);
  });

/** "Maak promotieplan", optionally steered. Bind the event. */
export const requestPromotionPlan = actionClient
  .metadata({
    name: 'requestPromotionPlan',
    conflictMessage: msg('promotion.plan.unavailable'),
    conflictMessages: [
      { prefix: 'promotion: audience', message: msg('promotion.plan.blockedError') },
      { prefix: 'promotion: disabled', message: msg('promotion.plan.disabledError') },
    ],
  })
  .bindArgsSchemas([id])
  .inputSchema(requestPlanSchema)
  .action(async ({ parsedInput, bindArgsParsedInputs: [eventId] }) => {
    await promotionPlanControllerRequest({
      path: { eventId },
      body: { instruction: parsedInput.instruction || undefined },
    });
    revalidatePath(`/events/${eventId}`, 'layout');
  });

/**
 * One promo action, as edited in the task dialog. Bind the event, the suggestion and whether to
 * add a budget line too.
 */
export const acceptPromoAction = actionClient
  .metadata({
    name: 'acceptPromoAction',
    apiFields: taskApiFields,
    conflictMessage: msg('ai.alreadyHandled'),
  })
  .bindArgsSchemas([id, id, z.boolean()])
  .inputSchema(taskFormSchema)
  .action(async ({ parsedInput, bindArgsParsedInputs: [eventId, suggestionId, addBudgetLine] }) => {
    await promotionPlanControllerAccept({
      path: { eventId },
      body: { items: [{ suggestionId, task: toTaskBody(parsedInput), addBudgetLine }] },
    });
    revalidateEvent(eventId);
  });

/** Several promo actions at once, as suggested. Bind the event. */
export const acceptPromoActionsAsIs = actionClient
  .metadata({ name: 'acceptPromoActionsAsIs', conflictMessage: msg('ai.alreadyHandled') })
  .bindArgsSchemas([id])
  .inputSchema(acceptPromoAsIsSchema)
  .action(async ({ parsedInput, bindArgsParsedInputs: [eventId] }) => {
    await promotionPlanControllerAccept({
      path: { eventId },
      body: {
        items: parsedInput.items.map(
          ({ suggestionId, title, description, dueDate, addBudgetLine }) => ({
            suggestionId,
            task: { title, description: description || null, dueDate },
            addBudgetLine,
          }),
        ),
      },
    });
    revalidateEvent(eventId);
  });
