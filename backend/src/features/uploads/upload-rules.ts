import type { TaskRow } from '../../db/schema/index.js';
import { canSeeTask, type TaskViewer } from '../tasks/task-rules.js';

/** The largest file one upload may be. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
/** What one organization may store in total (live files). */
export const ORGANIZATION_STORAGE_LIMIT_BYTES = 1024 * 1024 * 1024;
/** How long a signed upload or download URL works. */
export const SIGNED_URL_SECONDS = 5 * 60;
/** An upload not confirmed within this time is abandoned: the cleanup job removes it. */
export const PENDING_UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;
/** How long a deleted file stays in storage before the cleanup job removes it for good. */
export const DELETED_UPLOAD_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * The file types that may be uploaded, with the extensions each may carry. Documents, images and
 * spreadsheets only. SVG and HTML are left out on purpose: they can run scripts when opened.
 */
export const ALLOWED_FILE_TYPES: Readonly<Record<string, readonly string[]>> = {
  'application/pdf': ['pdf'],
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
  'image/heic': ['heic'],
  'image/heif': ['heif', 'heic'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['xlsx'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['pptx'],
  'application/msword': ['doc'],
  'application/vnd.ms-excel': ['xls'],
  'application/vnd.oasis.opendocument.text': ['odt'],
  'application/vnd.oasis.opendocument.spreadsheet': ['ods'],
  'text/csv': ['csv'],
  'text/plain': ['txt'],
};

const extensionOf = (name: string) => {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase();
};

/**
 * Why this file may not be uploaded, or null when it may. The name's extension has to match the
 * type, so a script can't come in renamed as a PDF's type with an `.html` name.
 */
export function fileError(file: {
  name: string;
  mimeType: string;
  sizeBytes: number;
}): string | null {
  const extensions = ALLOWED_FILE_TYPES[file.mimeType];
  if (!extensions) return 'mimeType: this file type is not allowed';
  if (!extensions.includes(extensionOf(file.name))) {
    return 'name: the extension does not match the file type';
  }
  if (file.sizeBytes <= 0) return 'sizeBytes: the file is empty';
  if (file.sizeBytes > MAX_UPLOAD_BYTES) return 'sizeBytes: the file is larger than 25 MB';
  return null;
}

/** Whether the organization has room for `sizeBytes` more. */
export const fitsInStorage = (usedBytes: number, sizeBytes: number) =>
  usedBytes + sizeBytes <= ORGANIZATION_STORAGE_LIMIT_BYTES;

/** Images and PDFs open in the browser; everything else downloads. */
export const opensInline = (mimeType: string) =>
  mimeType === 'application/pdf' || mimeType.startsWith('image/');

/** What a file is attached to. A task carries what visibility needs. */
export type UploadOwner =
  { type: 'event' } | { type: 'task'; task: Pick<TaskRow, 'assigneeUserId' | 'assigneeName'> };

/**
 * Who may do what with an event's files. Event files: everyone sees them, managers add and change
 * them. Task files: whoever sees the task sees them; managers and the task's assignee add them;
 * managers and whoever uploaded one change it.
 */
export function canSeeUpload(viewer: TaskViewer, owner: UploadOwner): boolean {
  return owner.type === 'event' || canSeeTask(viewer, owner.task);
}

export function canAddUpload(viewer: TaskViewer, owner: UploadOwner): boolean {
  if (viewer.canManage) return true;
  return owner.type === 'task' && owner.task.assigneeUserId === viewer.userId;
}

export function canChangeUpload(
  viewer: TaskViewer,
  owner: UploadOwner,
  upload: { uploadedByUserId: string },
): boolean {
  if (viewer.canManage) return true;
  return (
    owner.type === 'task' &&
    canSeeTask(viewer, owner.task) &&
    upload.uploadedByUserId === viewer.userId
  );
}

/** The object key: the organization's prefix and the upload's id, never the file name. */
export const storageKeyFor = (organizationId: string, uploadId: string) =>
  `orgs/${organizationId}/uploads/${uploadId}`;
