import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { FormError } from '@/components/form-error';
import { Skeleton } from '@/components/ui/skeleton';
import { ArchiveEvent } from '@/features/events/archive-event';
import { EventForm } from '@/features/events/event-form';
import { EventStatusSettings } from '@/features/events/event-status-settings';
import { editionOptions, toEventFormValues } from '@/features/events/schemas';
import { getEvent, listEvents } from '@/server/events/queries';

export const metadata: Metadata = { title: 'Instellingen' };

export default function EventSettingsPage({ params }: PageProps<'/events/[eventId]/settings'>) {
  return (
    <Suspense fallback={<Skeleton className="h-96 max-w-3xl rounded-card bg-card" />}>
      <EventSettings params={params} />
    </Suspense>
  );
}

async function EventSettings({ params }: Pick<PageProps<'/events/[eventId]/settings'>, 'params'>) {
  const { eventId } = await params;
  const [event, events, t] = await Promise.all([
    getEvent(eventId),
    listEvents(),
    getTranslations(),
  ]);
  const archived = event.status === 'archived';

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <section className="flex flex-col gap-5 rounded-card bg-card p-5 shadow-soft sm:p-8">
        <h2 className="text-lg">{t('eventForm.editTitle')}</h2>
        {archived && <FormError message={t('events.readOnly')} />}
        {/* key: a fresh form when the saved event changes */}
        <EventForm
          key={event.updatedAt}
          eventId={event.id}
          defaultValues={toEventFormValues(event)}
          editions={editionOptions(events, event.id)}
          readOnly={archived}
        />
      </section>
      <EventStatusSettings event={event} />
      {!archived && <ArchiveEvent eventId={event.id} />}
    </div>
  );
}
