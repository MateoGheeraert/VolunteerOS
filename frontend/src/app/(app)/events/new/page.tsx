import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { EventForm } from '@/features/events/event-form';
import { editionOptions } from '@/features/events/schemas';
import { listEvents } from '@/server/events/queries';

export const metadata: Metadata = { title: 'Nieuw evenement' };

export default async function NewEventPage() {
  const t = await getTranslations();
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader title={t('eventForm.createTitle')} description={t('eventForm.createSubtitle')} />
      <div className="rounded-card bg-card p-5 shadow-soft sm:p-8">
        <Suspense fallback={<Skeleton className="h-96" />}>
          <NewEventForm />
        </Suspense>
      </div>
    </div>
  );
}

/** The form needs the existing events to offer as previous editions. */
async function NewEventForm() {
  const events = await listEvents();
  return <EventForm editions={editionOptions(events)} />;
}
