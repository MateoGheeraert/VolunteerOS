import { z } from 'zod';
import { msg, type MessageKey } from '@/i18n/keys';
import { LOCALE } from '@/lib/format';

/**
 * What may be uploaded. The backend has the same list and decides (backend/src/features/uploads/
 * upload-rules.ts); this copy lets the picker filter files and refuse them before uploading.
 */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

const TYPES_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  doc: 'application/msword',
  xls: 'application/vnd.ms-excel',
  odt: 'application/vnd.oasis.opendocument.text',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  csv: 'text/csv',
  txt: 'text/plain',
};

/** For `<input type="file" accept>`. */
export const ACCEPT = Object.keys(TYPES_BY_EXTENSION)
  .map((extension) => `.${extension}`)
  .join(',');

export const extensionOf = (name: string) => {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase();
};

/**
 * The type to announce, from the extension: browsers report some types differently (CSV as
 * `application/vnd.ms-excel` on Windows, HEIC as nothing), the extension is what users see.
 */
export const mimeTypeOf = (name: string): string | undefined =>
  TYPES_BY_EXTENSION[extensionOf(name)];

/** Why a picked file can't be uploaded, or null. */
export function pickedFileError(file: { name: string; size: number }): MessageKey | null {
  if (!mimeTypeOf(file.name)) return msg('files.typeNotAllowed');
  if (file.size === 0) return msg('files.emptyFile');
  if (file.size > MAX_FILE_BYTES) return msg('files.tooLarge');
  return null;
}

export const startUploadSchema = z.object({
  name: z.string().trim().min(1).max(200),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().positive().max(MAX_FILE_BYTES),
  taskId: z.uuid().optional(),
});
export type StartUploadInput = z.infer<typeof startUploadSchema>;

export const renameFileSchema = z.object({
  name: z.string().trim().min(1, msg('files.nameRequired')).max(200),
});

const sizeFormat = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 });

/** "840 kB", "2,4 MB", "1 GB". */
export function formatBytes(bytes: number): string {
  const units = ['B', 'kB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${sizeFormat.format(value)} ${units[unit]}`;
}
