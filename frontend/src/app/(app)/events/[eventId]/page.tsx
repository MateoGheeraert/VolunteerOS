import { CalendarClock, History, Lightbulb, MapPin, Tag, Text, Users } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { Suspense, type ReactNode } from 'react';
import { IconBlob } from '@/components/layout/icon-blob';
import { Skeleton } from '@/components/ui/skeleton';
import { EventAiPanel } from '@/features/ai/event-ai-panel';
import { EventStatusBanner } from '@/features/events/event-status-banner';
import { canManageEvent, getEvent } from '@/server/events/queries';
import { formatEventRange, LOCALE } from '@/lib/format';

const countFormat = new Intl.NumberFormat(LOCALE);

export default function EventOverviewPage({ params }: PageProps<'/events/[eventId]'>) {
  return (
    <Suspense fallback={<Skeleton className="h-72 rounded-card bg-card" />}>
      <EventOverview params={params} />
    </Suspense>
  );
}

async function EventOverview({ params }: Pick<PageProps<'/events/[eventId]'>, 'params'>) {
  const { eventId } = await params;
  const [event, canManage, t] = await Promise.all([
    getEvent(eventId),
    canManageEvent(eventId),
    getTranslations(),
  ]);
  const count = (value: number) => countFormat.format(value);
  const { expectedAttendance: expected, actualAttendance: actual } = event;
  const attendance =
    actual !== null && expected !== null
      ? t('eventOverview.attendanceBoth', { actual: count(actual), expected: count(expected) })
      : actual !== null
        ? t('eventOverview.attendanceActual', { actual: count(actual) })
        : expected !== null
          ? t('eventOverview.attendanceExpected', { expected: count(expected) })
          : null;

  return (
    <>
      {/* Only those who may change the status get Mila's suggestion to. */}
      {canManage && <EventStatusBanner event={event} />}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section className="flex flex-col gap-5 rounded-card bg-card p-5 shadow-soft sm:p-6">
          <h2 className="text-lg">{t('eventOverview.details')}</h2>
          <dl className="grid gap-4">
            <Detail icon={<IconBlob icon={CalendarClock} />} label={t('eventOverview.when')}>
              {formatEventRange(event.startsAt, event.endsAt)}
            </Detail>
            <Detail icon={<IconBlob icon={MapPin} />} label={t('eventOverview.where')}>
              {event.location ?? (
                <span className="text-muted-foreground">{t('events.noLocation')}</span>
              )}
            </Detail>
            <Detail icon={<IconBlob icon={Tag} />} label={t('eventOverview.type')}>
              {t(`eventType.${event.eventType}`)}
            </Detail>
            <Detail icon={<IconBlob icon={Users} />} label={t('eventOverview.attendance')}>
              {attendance ?? (
                <span className="text-muted-foreground">{t('eventOverview.noAttendance')}</span>
              )}
            </Detail>
            <Detail icon={<IconBlob icon={Text} />} label={t('eventOverview.description')}>
              {event.description ? (
                <span className="whitespace-pre-line">{event.description}</span>
              ) : (
                <span className="text-muted-foreground">{t('eventOverview.noDescription')}</span>
              )}
            </Detail>
            {(event.previousEdition || event.nextEdition) && (
              <Detail icon={<IconBlob icon={History} />} label={t('events.editions')}>
                <span className="flex flex-col gap-0.5">
                  {event.previousEdition && (
                    <EditionLink label={t('events.continues')} edition={event.previousEdition} />
                  )}
                  {event.nextEdition && (
                    <EditionLink label={t('events.continuedBy')} edition={event.nextEdition} />
                  )}
                </span>
              </Detail>
            )}
            {event.retrospective && (
              <Detail icon={<IconBlob icon={Lightbulb} />} label={t('eventOverview.retrospective')}>
                <span className="whitespace-pre-line">{event.retrospective}</span>
              </Detail>
            )}
          </dl>
        </section>

        <Suspense fallback={<Skeleton className="h-72 rounded-card bg-brand-tint/60" />}>
          <EventAiPanel eventId={event.id} />
        </Suspense>
      </div>
    </>
  );
}

function EditionLink({ label, edition }: { label: string; edition: { id: string; name: string } }) {
  return (
    <span>
      <span className="font-normal text-muted-foreground">{label}: </span>
      <Link href={`/events/${edition.id}`} className="underline-offset-4 hover:underline">
        {edition.name}
      </Link>
    </span>
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
