import { ArrowLeft } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { Suspense } from 'react';
import { EventTabs } from '@/components/layout/event-tabs';
import { PageHeader } from '@/components/layout/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { EventStatusBadge } from '@/features/events/event-status-badge';
import { getEvent } from '@/server/events/queries';

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

/**
 * Shared by every tab, so it stays small: status, name and tabs. Date, place and editions are on
 * the overview, where they don't push each tab's own content down.
 */
async function EventHeader({ params }: Pick<LayoutProps<'/events/[eventId]'>, 'params'>) {
  const { eventId } = await params;
  const event = await getEvent(eventId);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow={<EventStatusBadge status={event.status} />} title={event.name} />
      <EventTabs eventId={event.id} />
    </div>
  );
}

function EventHeaderSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-6 w-24 rounded-full bg-card" />
        <Skeleton className="h-9 w-72 bg-card" />
      </div>
      <Skeleton className="h-10 w-full max-w-xl rounded-full bg-card" />
    </div>
  );
}
