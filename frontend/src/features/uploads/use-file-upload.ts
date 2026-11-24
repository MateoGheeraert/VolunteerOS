'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import type { PendingUpload } from '@/api/generated/types.gen';
import { confirmUpload, startUpload } from '@/server/uploads/actions';
import { mimeTypeOf, pickedFileError } from './schemas';

/** A file on its way up, for the progress list. */
export interface UploadInProgress {
  key: string;
  name: string;
  /** 0–1 while sending. */
  progress: number;
}

class UploadFailed extends Error {}

/**
 * Uploads picked or dropped files: Nest announces each one and signs a URL, the browser PUTs the
 * file straight to storage (Nest never sees the bytes), then Nest confirms it. Files go one after
 * another; a failure skips that file with a toast and carries on with the rest.
 */
export function useFileUpload({
  eventId,
  taskId,
  onUploaded,
}: {
  eventId: string;
  taskId?: string;
  onUploaded: () => void;
}) {
  const t = useTranslations();
  const [inProgress, setInProgress] = useState<UploadInProgress[]>([]);

  const uploadOne = useCallback(
    async (file: File, key: string) => {
      const mimeType = mimeTypeOf(file.name);
      const problem = pickedFileError(file);
      if (problem || !mimeType) throw new UploadFailed(t(problem ?? 'files.typeNotAllowed'));

      const start = startUpload.bind(null, eventId);
      const started = await start({ name: file.name, mimeType, sizeBytes: file.size, taskId });
      if (!started?.data) {
        throw new UploadFailed(t(started?.serverError?.message ?? 'common.genericError'));
      }
      await put(file, started.data, (progress) =>
        setInProgress((list) => list.map((u) => (u.key === key ? { ...u, progress } : u))),
      ).catch(() => {
        throw new UploadFailed(t('files.uploadFailed'));
      });
      const confirmed = await confirmUpload.bind(null, eventId, started.data.id)();
      if (confirmed?.serverError || !confirmed?.data) {
        throw new UploadFailed(t(confirmed?.serverError?.message ?? 'files.uploadFailed'));
      }
    },
    [eventId, taskId, t],
  );

  const upload = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      const queued = files.map((file, index) => ({
        file,
        key: `${Date.now()}-${index}-${file.name}`,
      }));
      setInProgress((list) => [
        ...list,
        ...queued.map(({ file, key }) => ({ key, name: file.name, progress: 0 })),
      ]);
      let uploaded = 0;
      for (const { file, key } of queued) {
        try {
          await uploadOne(file, key);
          uploaded++;
        } catch (error) {
          const reason = error instanceof UploadFailed ? error.message : t('common.genericError');
          toast.error(t('files.couldNotUpload', { name: file.name, reason }));
        } finally {
          setInProgress((list) => list.filter((u) => u.key !== key));
        }
      }
      if (uploaded > 0) onUploaded();
    },
    [uploadOne, onUploaded, t],
  );

  return { upload, inProgress };
}

/** The PUT to the signed URL, with progress. fetch() can't report upload progress; XHR can. */
function put(file: File, target: PendingUpload, onProgress: (progress: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', target.uploadUrl);
    // Signed into the URL: it must match exactly. The browser sets Content-Length itself.
    xhr.setRequestHeader('Content-Type', target.headers['Content-Type']);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Upload failed: ${xhr.status}`));
    xhr.onerror = () => reject(new Error('Upload failed: network error'));
    xhr.send(file);
  });
}
