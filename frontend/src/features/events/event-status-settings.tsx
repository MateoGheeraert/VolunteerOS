import { getTranslations } from 'next-intl/server';
import type { Event } from '@/api/generated/types.gen';
import { EventStatusButton } from './event-status-button';

/**
 * Undoing a status step, tucked away in the settings: Mila's banner on the overview moves an event
 * forward, this moves it back. Drafts and archived events have nothing to undo.
 */
export async function EventStatusSettings({ event }: { event: Pick<Event, 'id' | 'status'> }) {
  const t = await getTranslations('eventStatusSettings');

  const undo =
    event.status === 'published'
      ? { to: 'draft' as const, body: t('publishedBody'), label: t('unpublish') }
      : event.status === 'completed'
        ? { to: 'published' as const, body: t('completedBody'), label: t('reopen') }
        : null;
  if (!undo) return null;

  return (
    <section className="flex flex-col gap-3 rounded-card bg-card p-5 shadow-soft sm:p-6">
      <h2 className="text-lg">{t('title')}</h2>
      <p className="text-muted-foreground">{undo.body}</p>
      <div>
        <EventStatusButton eventId={event.id} to={undo.to}>
          {undo.label}
        </EventStatusButton>
      </div>
    </section>
  );
}
