'use client';

import { useRouter } from 'next/navigation';
import type { UploadList } from '@/api/generated/types.gen';
import { FilesPanel } from './files-panel';

/** The event's "Bestanden" tab: its own files and those of its tasks, in one list. */
export function EventFiles({
  eventId,
  list,
  readOnly,
}: {
  eventId: string;
  list: UploadList;
  readOnly: boolean;
}) {
  const router = useRouter();
  return (
    <FilesPanel
      eventId={eventId}
      uploads={list.uploads}
      canAdd={list.canAddToEvent}
      enabled={list.enabled}
      readOnly={readOnly}
      storage={list.storage}
      showTask
      onChanged={() => router.refresh()}
    />
  );
}
