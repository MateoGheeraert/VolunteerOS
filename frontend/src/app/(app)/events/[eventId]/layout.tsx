import { ArrowLeft, ArrowRight, History, MapPin } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { Suspense, type ReactNode } from 'react';
import type { EditionRef } from '@/api/generated/types.gen';
import { EventTabs } from '@/components/layout/event-tabs';
import { PageHeader } from '@/components/layout/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { EventStatusBadge } from '@/features/events/event-status-badge';
import { getEvent } from '@/server/events/queries';
import { formatEventRange } from '@/lib/format';

export default async function EventLayout({ children, params }: LayoutProps<'/events/[eventId]'>) {
  const t = await getTranslations();
  return (
    <>
      <Link
        href="/events"
        className="inline-flex w-fit items-center gap-1.5 text-sm font-bold text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {t('nav.events')}
      </Link>
      <Suspense fallback={<EventHeaderSkeleton />}>
        <EventHeader params={params} />
      </Suspense>
      {children}
    </>
  );
}

async function EventHeader({ params }: Pick<LayoutProps<'/events/[eventId]'>, 'params'>) {
  const { eventId } = await params;
  const [event, t] = await Promise.all([getEvent(eventId), getTranslations()]);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow={<EventStatusBadge status={event.status} />}
        title={event.name}
        description={
          <span className="flex flex-wrap gap-x-4 gap-y-1">
            <span>{formatEventRange(event.startsAt, event.endsAt)}</span>
            {event.location && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-4" aria-hidden />
                {event.location}
              </span>
            )}
          </span>
        }
      />
      {(event.previousEdition || event.nextEdition) && (
        <nav
          aria-label={t('events.editions')}
          className="-mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm"
        >
          {event.previousEdition && (
            <EditionLink
              label={t('events.continues')}
              edition={event.previousEdition}
              icon={<History className="size-4" aria-hidden />}
            />
          )}
          {event.nextEdition && (
            <EditionLink
              label={t('events.continuedBy')}
              edition={event.nextEdition}
              icon={<ArrowRight className="size-4" aria-hidden />}
            />
          )}
        </nav>
      )}
      <EventTabs eventId={event.id} />
    </div>
  );
}

function EditionLink({
  label,
  edition,
  icon,
}: {
  label: string;
  edition: EditionRef;
  icon: ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
      {icon}
      {label}:
      <Link
        href={`/events/${edition.id}`}
        className="font-bold text-foreground underline-offset-4 hover:underline"
      >
        {edition.name}
      </Link>
    </span>
  );
}

function EventHeaderSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-6 w-24 rounded-full bg-card" />
        <Skeleton className="h-9 w-72 bg-card" />
        <Skeleton className="h-5 w-56 bg-card" />
      </div>
      <Skeleton className="h-10 w-full max-w-xl rounded-full bg-card" />
    </div>
  );
}
