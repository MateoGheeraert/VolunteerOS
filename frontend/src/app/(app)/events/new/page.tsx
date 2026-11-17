import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/layout/page-header';
import { EventForm } from '@/features/events/event-form';

export const metadata: Metadata = { title: 'Nieuw evenement' };

export default async function NewEventPage() {
  const t = await getTranslations();
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader title={t('eventForm.createTitle')} description={t('eventForm.createSubtitle')} />
      <div className="rounded-3xl bg-card p-5 shadow-soft sm:p-8">
        <EventForm />
      </div>
    </div>
  );
}
