import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { FormError } from '@/components/form-error';
import { Skeleton } from '@/components/ui/skeleton';
import { EventFiles } from '@/features/uploads/event-files';
import { getEvent } from '@/server/events/queries';
import { listUploads } from '@/server/uploads/queries';

export const metadata: Metadata = { title: 'Bestanden' };

export default function EventFilesPage({ params }: PageProps<'/events/[eventId]/files'>) {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-card bg-card" />}>
      <Files params={params} />
    </Suspense>
  );
}

/** Quotes, floor plans, receipts: the event's files and its tasks' files in one place. */
async function Files({ params }: Pick<PageProps<'/events/[eventId]/files'>, 'params'>) {
  const { eventId } = await params;
  const [event, list, t] = await Promise.all([
    getEvent(eventId),
    listUploads(eventId),
    getTranslations(),
  ]);
  const readOnly = event.status === 'archived';
  return (
    <div className="flex flex-col gap-4">
      {readOnly && <FormError message={t('files.readOnly')} />}
      <EventFiles eventId={event.id} list={list} readOnly={readOnly} />
    </div>
  );
}
