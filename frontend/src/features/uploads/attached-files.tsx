'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { UploadList } from '@/api/generated/types.gen';
import { Skeleton } from '@/components/ui/skeleton';
import { listBudgetEntryUploads, listTaskUploads } from '@/server/uploads/actions';
import { FilesPanel, type FileOwner } from './files-panel';

/**
 * The files of one task or budget entry, in its modal. The modal is a client component, so the
 * list is fetched when it opens, and again after each change. Mount it keyed by the owner, so
 * switching starts from an empty list.
 */
export function AttachedFiles({
  eventId,
  owner,
  canAdd,
  readOnly,
}: {
  eventId: string;
  owner: FileOwner;
  canAdd: boolean;
  readOnly: boolean;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [list, setList] = useState<UploadList | null>(null);
  const [failed, setFailed] = useState(false);
  /** Bumped after a change, to fetch the list again. */
  const [version, setVersion] = useState(0);
  const ownerId = 'taskId' in owner ? owner.taskId : owner.budgetEntryId;
  const isTask = 'taskId' in owner;

  useEffect(() => {
    let current = true;
    const load = isTask
      ? listTaskUploads.bind(null, eventId, ownerId)
      : listBudgetEntryUploads.bind(null, eventId, ownerId);
    void load().then((result) => {
      if (!current) return;
      if (result?.data) setList(result.data);
      else setFailed(true);
    });
    return () => {
      current = false;
    };
  }, [eventId, ownerId, isTask, version]);

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-bold text-muted-foreground">{t('files.title')}</h3>
      {failed ? (
        <p className="text-sm text-muted-foreground">{t('common.genericError')}</p>
      ) : list ? (
        <FilesPanel
          eventId={eventId}
          owner={owner}
          uploads={list.uploads}
          canAdd={canAdd}
          enabled={list.enabled}
          readOnly={readOnly}
          onChanged={() => {
            setVersion((v) => v + 1);
            // The event's file tab lists these files too, and the budget shows a file count.
            router.refresh();
          }}
        />
      ) : (
        <Skeleton className="h-16 rounded-2xl" />
      )}
    </section>
  );
}
