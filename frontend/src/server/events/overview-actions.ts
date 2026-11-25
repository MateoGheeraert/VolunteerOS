'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { overviewControllerDismissHint } from '@/api/generated';
import { zDismissMilaHint } from '@/api/generated/zod.gen';
import { actionClient } from '../action-client';

/** Puts one of Mila's overview hints away until its situation changes. Bind the event. */
export const dismissMilaHint = actionClient
  .metadata({ name: 'dismissMilaHint' })
  .bindArgsSchemas([z.uuid()])
  .inputSchema(zDismissMilaHint)
  .action(async ({ parsedInput, bindArgsParsedInputs: [eventId] }) => {
    await overviewControllerDismissHint({ path: { eventId }, body: parsedInput });
    revalidatePath(`/events/${eventId}`);
  });
