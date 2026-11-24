import { Suspense } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { EventStatusBadge } from '@/features/events/event-status-badge';
import { getEvent } from '@/server/events/queries';

/** The event's sections and the way back to the events list live in the sidebar. */
export default function EventLayout({ children, params }: LayoutProps<'/events/[eventId]'>) {
  return (
    <>
      <Suspense fallback={<EventHeaderSkeleton />}>
        <EventHeader params={params} />
      </Suspense>
      {children}
    </>
  );
}

/**
 * Shared by every section, so it stays small: status and name. Date, place and editions are on
 * the overview, where they don't push each section's own content down.
 */
async function EventHeader({ params }: Pick<LayoutProps<'/events/[eventId]'>, 'params'>) {
  const { eventId } = await params;
  const event = await getEvent(eventId);
  return <PageHeader eyebrow={<EventStatusBadge status={event.status} />} title={event.name} />;
}

function EventHeaderSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="h-6 w-24 rounded-full bg-card" />
      <Skeleton className="h-9 w-72 bg-card" />
    </div>
  );
}
