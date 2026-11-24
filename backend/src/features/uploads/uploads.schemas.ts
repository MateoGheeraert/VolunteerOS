import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import { dateTimeOutput } from '../../common/schemas.js';
import { upload } from '../../db/schema/index.js';
import { MAX_UPLOAD_BYTES } from './upload-rules.js';

/**
 * API contracts for files attached to an event, its tasks or its budget entries, derived from the `upload` table.
 * Type, extension and size rules live in upload-rules.ts; these schemas only check the shape.
 */

const uploadInput = createInsertSchema(upload, {
  name: (schema) => schema.trim().min(1).max(200),
  mimeType: (schema) => schema.min(1).max(200),
  sizeBytes: () => z.number().int().positive().max(MAX_UPLOAD_BYTES),
});

/**
 * Announces a file before the browser uploads it. It belongs to the task (`taskId`), the budget
 * entry (`budgetEntryId`) or, with neither, the event.
 */
export const createUploadSchema = uploadInput
  .pick({ name: true, mimeType: true, sizeBytes: true })
  .extend({ taskId: z.uuid().optional(), budgetEntryId: z.uuid().optional() })
  .refine((value) => !value.taskId || !value.budgetEntryId, {
    message: 'Set either taskId or budgetEntryId, not both',
    path: ['budgetEntryId'],
  })
  .meta({ id: 'CreateUpload' });
export type CreateUploadInput = z.infer<typeof createUploadSchema>;

/** A new name; the extension must stay the same. */
export const renameUploadSchema = uploadInput.pick({ name: true }).meta({ id: 'RenameUpload' });
export type RenameUploadInput = z.infer<typeof renameUploadSchema>;

export const uploadSchema = createSelectSchema(upload, { createdAt: dateTimeOutput })
  .pick({ id: true, name: true, mimeType: true, sizeBytes: true, createdAt: true })
  .extend({
    uploadedBy: z.object({ userId: z.string(), name: z.string() }),
    /** The task it is attached to, if any. */
    task: z.object({ id: z.uuid(), title: z.string() }).nullable(),
    /** The budget entry it is attached to, if any. With neither, it is a file of the event. */
    budgetEntry: z.object({ id: z.uuid(), title: z.string() }).nullable(),
    /** Whether the caller may rename or delete it. */
    canChange: z.boolean(),
  })
  .meta({ id: 'Upload' });
export type UploadDto = z.infer<typeof uploadSchema>;

export const storageUsageSchema = z
  .object({ usedBytes: z.number().int(), limitBytes: z.number().int() })
  .meta({ id: 'StorageUsage' });
export type StorageUsageDto = z.infer<typeof storageUsageSchema>;

export const uploadListSchema = z
  .object({
    uploads: z.array(uploadSchema),
    storage: storageUsageSchema,
    /** False when file storage is off: nothing can be added or downloaded. */
    enabled: z.boolean(),
    /** Whether the caller may add files to the event itself (task files depend on the task). */
    canAddToEvent: z.boolean(),
  })
  .meta({ id: 'UploadList' });
export type UploadListDto = z.infer<typeof uploadListSchema>;

/** Where the browser PUTs the file, with the headers it must send exactly. */
export const pendingUploadSchema = z
  .object({
    id: z.uuid(),
    uploadUrl: z.url(),
    headers: z.object({ 'Content-Type': z.string() }),
    expiresAt: dateTimeOutput,
  })
  .meta({ id: 'PendingUpload' });
export type PendingUploadDto = z.infer<typeof pendingUploadSchema>;

export const downloadUrlSchema = z
  .object({ url: z.url(), expiresAt: dateTimeOutput })
  .meta({ id: 'DownloadUrl' });
export type DownloadUrlDto = z.infer<typeof downloadUrlSchema>;
