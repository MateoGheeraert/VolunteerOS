import { z } from 'zod';

/** API contracts for deleting your own account. */

export const deleteAccountSchema = z
  .object({
    /** The current password: deleting the account is confirmed with it. */
    password: z.string().min(1).max(256),
  })
  .meta({ id: 'DeleteAccount' });
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;

const blockingOrganizationSchema = z
  .object({ id: z.string(), name: z.string() })
  .meta({ id: 'DeletionBlockingOrganization' });

const deletedOrganizationSchema = z
  .object({ id: z.string(), name: z.string(), eventCount: z.number().int() })
  .meta({ id: 'DeletionDeletedOrganization' });

/**
 * What deleting the account would do right now.
 * - `blockingOrganizations`: organizations where the caller is the only owner while others are
 *   members. Deleting is refused until someone else there is owner too.
 * - `organizationsToDelete`: organizations whose only member is the caller. They are deleted with
 *   the account.
 */
export const deletionCheckSchema = z
  .object({
    canDelete: z.boolean(),
    blockingOrganizations: z.array(blockingOrganizationSchema),
    organizationsToDelete: z.array(deletedOrganizationSchema),
  })
  .meta({ id: 'DeletionCheck' });
export type DeletionCheckDto = z.infer<typeof deletionCheckSchema>;
