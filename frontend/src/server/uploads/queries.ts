import 'server-only';
import { uploadsControllerDownload, uploadsControllerList } from '@/api/generated';
import { query } from '../query';

/** The event's files and those of its tasks the caller sees, with the organization's usage. */
export const listUploads = (eventId: string) => query(uploadsControllerList({ path: { eventId } }));

/**
 * A short-lived signed link to one file. Not a `query`: the download route answers errors itself
 * instead of rendering a page. Throws ApiError (404 for files the caller may not see).
 */
export async function getDownloadUrl(eventId: string, uploadId: string): Promise<string> {
  const { data } = await uploadsControllerDownload({ path: { eventId, uploadId } });
  return data.url;
}
