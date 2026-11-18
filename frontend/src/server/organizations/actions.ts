'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { organizationPatchSchema } from '@/features/organizations/profile';
import { actionClient } from '../action-client';
import { authPost } from '../auth';

/**
 * One inline edit on the organization settings page (bind the organization, so a switch in
 * another tab can't redirect the edit). Better Auth only lets owners and admins update; the
 * backend validates the values again and logs the change.
 */
export const updateOrganization = actionClient
  .metadata({ name: 'updateOrganization' })
  .bindArgsSchemas([z.string().min(1)])
  .inputSchema(organizationPatchSchema)
  .action(async ({ parsedInput, bindArgsParsedInputs: [organizationId] }) => {
    await authPost('/organization/update', { organizationId, data: parsedInput });
    // The name also shows in the organization switcher on every page.
    revalidatePath('/', 'layout');
  });
