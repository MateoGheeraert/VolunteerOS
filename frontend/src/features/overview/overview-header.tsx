import { CalendarDays, History, MapPin, Pencil } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { EventDetail } from '@/api/generated/types.gen';
import { Button } from '@/components/ui/button';
import { formatEventRange } from '@/lib/format';

/**
 * Right under the event's title: only what you need at a glance (when, where, the previous
 * edition), and the actions. Everything else about the event is in its settings.
 */
export async function OverviewHeader({
  event,
  canManage,
  askMila,
}: {
  event: Pick<EventDetail, 'id' | 'startsAt' | 'endsAt' | 'location' | 'previousEdition'>;
  canManage: boolean;
  askMila?: ReactNode;
}) {
  const t = await getTranslations('overview');
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
      <ul className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm font-semibold text-muted-foreground">
        <Item icon={<CalendarDays />}>{formatEventRange(event.startsAt, event.endsAt)}</Item>
        {event.location && <Item icon={<MapPin />}>{event.location}</Item>}
        {event.previousEdition && (
          <Item icon={<History />}>
            <Link
              href={`/events/${event.previousEdition.id}`}
              className="text-brand-primary-bright underline-offset-4 hover:underline"
            >
              {t('previousEdition', { name: event.previousEdition.name })}
            </Link>
          </Item>
        )}
      </ul>
      {(canManage || askMila) && (
        <div className="flex flex-wrap gap-2">
          {canManage && (
            <Button asChild variant="secondary">
              <Link href={`/events/${event.id}/settings`}>
                <Pencil aria-hidden />
                {t('edit')}
              </Link>
            </Button>
          )}
          {askMila}
        </div>
      )}
    </div>
  );
}

function Item({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex min-w-0 items-center gap-1.5 [&>svg]:size-4 [&>svg]:shrink-0">
      {icon}
      <span className="min-w-0">{children}</span>
    </li>
  );
}
