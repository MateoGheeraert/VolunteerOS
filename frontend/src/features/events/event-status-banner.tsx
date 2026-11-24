import { getTranslations } from 'next-intl/server';
import type { Event } from '@/api/generated/types.gen';
import { MilaBar } from '@/components/mila';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EventStatusButton } from './event-status-button';

/**
 * Mila suggests the event's next step under its title: publish a draft, or mark a published event
 * as done once it's over. Nothing to suggest otherwise. Undoing a step lives in the settings.
 * Only for those who may change the status.
 */
export async function EventStatusBanner({
  event,
}: {
  event: Pick<Event, 'id' | 'status' | 'endsAt'>;
}) {
  const t = await getTranslations('eventStatusBanner');

  if (event.status === 'draft') {
    return (
      <MilaBar
        message={t('publishMessage')}
        detail={t('publishDetail')}
        actions={
          <>
            <EventStatusButton eventId={event.id} to="published" variant="mila">
              {t('publish')}
            </EventStatusButton>
            <Button variant="mila-soft" disabled>
              {t('makeReady')}
              <Badge variant="outline" className="border-mila-ink/20 text-mila-ink">
                {t('comingSoon')}
              </Badge>
            </Button>
          </>
        }
      />
    );
  }

  if (event.status === 'published' && new Date(event.endsAt) < new Date()) {
    return (
      <MilaBar
        message={t('completeMessage')}
        detail={t('completeDetail')}
        actions={
          <EventStatusButton eventId={event.id} to="completed" variant="mila">
            {t('complete')}
          </EventStatusButton>
        }
      />
    );
  }

  return null;
}
