import { CalendarClock, ListChecks, MapPin, Text } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Suspense, type ReactNode } from 'react';
import { IconBlob } from '@/components/layout/icon-blob';
import { Skeleton } from '@/components/ui/skeleton';
import { EventStatusActions } from '@/features/events/event-status-actions';
import { getEvent } from '@/server/events/queries';
import { formatEventRange } from '@/lib/format';

export default function EventOverviewPage({ params }: PageProps<'/events/[eventId]'>) {
  return (
    <Suspense fallback={<Skeleton className="h-72 rounded-3xl bg-card" />}>
      <EventOverview params={params} />
    </Suspense>
  );
}

async function EventOverview({ params }: Pick<PageProps<'/events/[eventId]'>, 'params'>) {
  const { eventId } = await params;
  const [event, t] = await Promise.all([getEvent(eventId), getTranslations()]);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <section className="flex flex-col gap-5 rounded-3xl bg-card p-5 shadow-soft sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg">{t('eventOverview.details')}</h2>
          <EventStatusActions eventId={event.id} status={event.status} />
        </div>
        <dl className="grid gap-4">
          <Detail icon={<IconBlob icon={CalendarClock} />} label={t('eventOverview.when')}>
            {formatEventRange(event.startsAt, event.endsAt)}
          </Detail>
          <Detail icon={<IconBlob icon={MapPin} />} label={t('eventOverview.where')}>
            {event.location ?? (
              <span className="text-muted-foreground">{t('events.noLocation')}</span>
            )}
          </Detail>
          <Detail icon={<IconBlob icon={Text} />} label={t('eventOverview.description')}>
            {event.description ? (
              <span className="whitespace-pre-line">{event.description}</span>
            ) : (
              <span className="text-muted-foreground">{t('eventOverview.noDescription')}</span>
            )}
          </Detail>
        </dl>
      </section>

      <section className="flex flex-col items-start gap-3 rounded-3xl bg-brand-tint p-5 sm:p-6">
        <IconBlob icon={ListChecks} tone="accent" className="bg-card" />
        <h2 className="text-lg">{t('eventOverview.nextStepsTitle')}</h2>
        <p className="text-muted-foreground">{t('eventOverview.nextStepsBody')}</p>
      </section>
    </div>
  );
}

function Detail({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      {icon}
      <div className="flex min-w-0 flex-col">
        <dt className="text-sm font-bold text-muted-foreground">{label}</dt>
        <dd className="font-semibold">{children}</dd>
      </div>
    </div>
  );
}
