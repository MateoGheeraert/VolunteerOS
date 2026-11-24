'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { UploadList } from '@/api/generated/types.gen';
import { Skeleton } from '@/components/ui/skeleton';
import { listTaskUploads } from '@/server/uploads/actions';
import { FilesPanel } from './files-panel';

/**
 * A task's files in the task pane. The pane is a client component, so the list is fetched when
 * it opens, and again after each change. Managers and the task's assignee add files. Mount it
 * keyed by the task, so switching tasks starts from an empty list.
 */
export function TaskFiles({
  eventId,
  taskId,
  canAdd,
  readOnly,
}: {
  eventId: string;
  taskId: string;
  canAdd: boolean;
  readOnly: boolean;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [list, setList] = useState<UploadList | null>(null);
  const [failed, setFailed] = useState(false);
  /** Bumped after a change, to fetch the list again. */
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let current = true;
    void listTaskUploads
      .bind(null, eventId, taskId)()
      .then((result) => {
        if (!current) return;
        if (result?.data) setList(result.data);
        else setFailed(true);
      });
    return () => {
      current = false;
    };
  }, [eventId, taskId, version]);

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-bold text-muted-foreground">{t('files.title')}</h3>
      {failed ? (
        <p className="text-sm text-muted-foreground">{t('common.genericError')}</p>
      ) : list ? (
        <FilesPanel
          eventId={eventId}
          taskId={taskId}
          uploads={list.uploads}
          canAdd={canAdd}
          enabled={list.enabled}
          readOnly={readOnly}
          onChanged={() => {
            setVersion((v) => v + 1);
            // The event's file tab lists task files too.
            router.refresh();
          }}
        />
      ) : (
        <Skeleton className="h-16 rounded-2xl" />
      )}
    </section>
  );
}
