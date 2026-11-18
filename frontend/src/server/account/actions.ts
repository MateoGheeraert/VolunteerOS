'use server';

import { accountControllerRemove } from '@/api/generated';
import { deleteAccountSchema } from '@/features/settings/schemas';
import { msg } from '@/i18n/keys';
import { actionClient } from '../action-client';

/**
 * Deletes the caller's account. A wrong password comes back as a `password` field error, a
 * deletion that became blocked meanwhile as `settings.delete.blockedNow`. The session is gone
 * afterwards: the browser signs out (clearing its cookie) and leaves the app.
 */
export const deleteAccount = actionClient
  .metadata({ name: 'deleteAccount', conflictMessage: msg('settings.delete.blockedNow') })
  .inputSchema(deleteAccountSchema)
  .action(async ({ parsedInput }) => {
    await accountControllerRemove({ body: parsedInput });
  });
