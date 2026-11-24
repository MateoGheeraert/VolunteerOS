'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  uploadsControllerConfirm,
  uploadsControllerCreate,
  uploadsControllerList,
  uploadsControllerRemove,
  uploadsControllerRename,
} from '@/api/generated';
import { renameFileSchema, startUploadSchema } from '@/features/uploads/schemas';
import { msg } from '@/i18n/keys';
import { actionClient } from '../action-client';

const id = z.uuid();
const revalidateFiles = (eventId: string) => revalidatePath(`/events/${eventId}/files`);

/**
 * Step 1 of an upload (bind the event): announces the file and returns where the browser PUTs it.
 * Nest checks the type, size, permission and the organization's storage left.
 */
export const startUpload = actionClient
  .metadata({ name: 'startUpload', conflictMessage: msg('files.storageFull') })
  .bindArgsSchemas([id])
  .inputSchema(startUploadSchema)
  .action(async ({ parsedInput, bindArgsParsedInputs: [eventId] }) => {
    const { data } = await uploadsControllerCreate({ path: { eventId }, body: parsedInput });
    return data;
  });

/** Step 3 (bind event and upload), after the browser's PUT: Nest checks the file and lists it. */
export const confirmUpload = actionClient
  .metadata({ name: 'confirmUpload', conflictMessage: msg('files.notUploaded') })
  .bindArgsSchemas([id, id])
  .action(async ({ bindArgsParsedInputs: [eventId, uploadId] }) => {
    const { data } = await uploadsControllerConfirm({ path: { eventId, uploadId } });
    revalidateFiles(eventId);
    return data;
  });

export const renameUpload = actionClient
  .metadata({ name: 'renameUpload' })
  .bindArgsSchemas([id, id])
  .inputSchema(renameFileSchema)
  .action(async ({ parsedInput, bindArgsParsedInputs: [eventId, uploadId] }) => {
    await uploadsControllerRename({ path: { eventId, uploadId }, body: parsedInput });
    revalidateFiles(eventId);
  });

export const deleteUpload = actionClient
  .metadata({ name: 'deleteUpload' })
  .bindArgsSchemas([id, id])
  .action(async ({ bindArgsParsedInputs: [eventId, uploadId] }) => {
    await uploadsControllerRemove({ path: { eventId, uploadId } });
    revalidateFiles(eventId);
  });

/** One task's files, for the task pane, which is a client component (bind event and task). */
export const listTaskUploads = actionClient
  .metadata({ name: 'listTaskUploads' })
  .bindArgsSchemas([id, id])
  .action(async ({ bindArgsParsedInputs: [eventId, taskId] }) => {
    const { data } = await uploadsControllerList({ path: { eventId }, query: { taskId } });
    return data;
  });
