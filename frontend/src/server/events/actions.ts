'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  eventsControllerArchive,
  eventsControllerCreate,
  eventsControllerUpdate,
} from '@/api/generated';
import {
  changeStatusSchema,
  eventApiFields,
  eventFormSchema,
  toEventBody,
} from '@/features/events/schemas';
import { msg } from '@/i18n/keys';
import { actionClient } from '../action-client';

const eventId = z.uuid();

export const createEvent = actionClient
  .metadata({ name: 'createEvent', apiFields: eventApiFields })
  .inputSchema(eventFormSchema)
  .action(async ({ parsedInput }) => {
    const { data } = await eventsControllerCreate({ body: toEventBody(parsedInput) });
    revalidatePath('/events');
    return { id: data.id };
  });

/** Bind the event id: `updateEvent.bind(null, eventId)`. */
export const updateEvent = actionClient
  .metadata({
    name: 'updateEvent',
    apiFields: eventApiFields,
    conflictMessage: msg('eventForm.shiftsOutside'),
  })
  .bindArgsSchemas([eventId])
  .inputSchema(eventFormSchema)
  .action(async ({ parsedInput, bindArgsParsedInputs: [id] }) => {
    await eventsControllerUpdate({ path: { eventId: id }, body: toEventBody(parsedInput) });
    revalidatePath('/events', 'layout');
  });

export const changeEventStatus = actionClient
  .metadata({ name: 'changeEventStatus' })
  .bindArgsSchemas([eventId])
  .inputSchema(changeStatusSchema)
  .action(async ({ parsedInput, bindArgsParsedInputs: [id] }) => {
    await eventsControllerUpdate({ path: { eventId: id }, body: parsedInput });
    revalidatePath('/events', 'layout');
  });

export const archiveEvent = actionClient
  .metadata({ name: 'archiveEvent' })
  .bindArgsSchemas([eventId])
  .action(async ({ bindArgsParsedInputs: [id] }) => {
    await eventsControllerArchive({ path: { eventId: id } });
    revalidatePath('/events', 'layout');
  });
