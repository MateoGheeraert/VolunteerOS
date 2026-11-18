'use server';

import { revalidatePath } from 'next/cache';
import { profileControllerUpdate } from '@/api/generated';
import { addressFormSchema, profilePatchSchema } from '@/features/settings/schemas';
import { actionClient } from '../action-client';

/** The whole app shows the name (user menu), so a profile change refreshes every page. */
const revalidateProfile = () => revalidatePath('/', 'layout');

/** One inline edit on the profile page: only the fields sent change. */
export const patchProfile = actionClient
  .metadata({ name: 'patchProfile' })
  .inputSchema(profilePatchSchema)
  .action(async ({ parsedInput }) => {
    await profileControllerUpdate({ body: parsedInput });
    revalidateProfile();
  });

/** Saves the address as a whole. */
export const saveAddress = actionClient
  .metadata({ name: 'saveAddress' })
  .inputSchema(addressFormSchema)
  .action(async ({ parsedInput }) => {
    const { box, ...address } = parsedInput;
    await profileControllerUpdate({ body: { address: { ...address, box: box || null } } });
    revalidateProfile();
  });

export const clearAddress = actionClient.metadata({ name: 'clearAddress' }).action(async () => {
  await profileControllerUpdate({ body: { address: null } });
  revalidateProfile();
});
