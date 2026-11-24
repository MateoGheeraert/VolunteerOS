import { CalendarPlus, ChevronRight, MapPin } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import type { Event } from '@/api/generated/types.gen';
import { IconBlob } from '@/components/layout/icon-blob';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatEventRange } from '@/lib/format';
import { EventStatusBadge } from './event-status-badge';
import { listEvents } from '@/server/events/queries';

export async function EventList() {
  const [events, t] = await Promise.all([listEvents(), getTranslations()]);
  const byStart = (a: Event, b: Event) => a.startsAt.localeCompare(b.startsAt);
  const current = events.filter((event) => event.status !== 'archived').sort(byStart);
  const archived = events
    .filter((event) => event.status === 'archived')
    .sort(byStart)
    .reverse();

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-card bg-card px-6 py-14 text-center shadow-soft">
        <IconBlob icon={CalendarPlus} size="lg" />
        <h2 className="text-xl">{t('events.emptyTitle')}</h2>
        <p className="max-w-md text-muted-foreground">{t('events.emptyBody')}</p>
        <Button asChild size="lg" className="mt-2">
          <Link href="/events/new">{t('events.emptyButton')}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <ul className="grid gap-3">
        {current.map((event) => (
          <EventRow key={event.id} event={event} noLocation={t('events.noLocation')} />
        ))}
      </ul>
      {archived.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer list-none font-bold text-muted-foreground hover:text-foreground">
            <span className="group-open:hidden">
              {t('events.showArchived')} ({archived.length})
            </span>
            <span className="hidden group-open:inline">{t('events.hideArchived')}</span>
          </summary>
          <ul className="mt-3 grid gap-3 opacity-80">
            {archived.map((event) => (
              <EventRow key={event.id} event={event} noLocation={t('events.noLocation')} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function EventRow({ event, noLocation }: { event: Event; noLocation: string }) {
  return (
    <li>
      <Link
        href={`/events/${event.id}`}
        className="group flex items-center gap-4 rounded-2xl bg-card p-4 shadow-soft transition-shadow outline-none hover:shadow-md focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:p-5"
      >
        <DateTile iso={event.startsAt} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-lg font-extrabold">{event.name}</span>
            <EventStatusBadge status={event.status} />
          </div>
          <span className="text-sm text-muted-foreground">
            {formatEventRange(event.startsAt, event.endsAt)}
          </span>
          <span className="flex items-center gap-1 text-sm text-muted-foreground">
            <MapPin className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{event.location ?? noLocation}</span>
          </span>
        </div>
        <ChevronRight
          className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
          aria-hidden
        />
      </Link>
    </li>
  );
}

const tileDay = new Intl.DateTimeFormat('nl-BE', { timeZone: 'Europe/Brussels', day: 'numeric' });
const tileMonth = new Intl.DateTimeFormat('nl-BE', { timeZone: 'Europe/Brussels', month: 'short' });

/** A small calendar-sheet tile: the quickest way to scan a list of events by date. */
function DateTile({ iso }: { iso: string }) {
  const date = new Date(iso);
  return (
    <span className="flex size-14 shrink-0 flex-col items-center justify-center rounded-2xl bg-brand-tint text-primary">
      <span className="text-xl leading-none font-extrabold">{tileDay.format(date)}</span>
      <span className="text-xs font-bold uppercase">{tileMonth.format(date).replace('.', '')}</span>
    </span>
  );
}

export function EventListSkeleton() {
  return (
    <div className="grid gap-3">
      {[0, 1, 2].map((key) => (
        <Skeleton key={key} className="h-24 rounded-2xl bg-card" />
      ))}
    </div>
  );
}
