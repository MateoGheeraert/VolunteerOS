import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { FormError } from '@/components/form-error';
import { Skeleton } from '@/components/ui/skeleton';
import { getMilaContext } from '@/features/ai/mila-context';
import { AudienceCard } from '@/features/promotion/audience-card';
import { PromotionBoard } from '@/features/promotion/promotion-board';
import { todayInBrussels } from '@/features/tasks/task-rules';
import { TasksProvider } from '@/features/tasks/tasks-context';
import { utcIsoToBrussels } from '@/lib/format';
import { canManageEvent, getEvent } from '@/server/events/queries';
import { getPromotionState } from '@/server/promotion/queries';

export const metadata: Metadata = { title: 'Promotie' };

export default function EventPromotionPage({ params }: PageProps<'/events/[eventId]/promotion'>) {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-card bg-card" />}>
      <EventPromotion params={params} />
    </Suspense>
  );
}

/**
 * The Promotie tab (docs/info.md §7.11): Mila on top, the Promotie tasks and her proposals on a
 * timeline with the pilot metric, and the Publiek in one line below. `?publiek=open` opens the
 * Publiek dialog.
 */
async function EventPromotion({
  params,
}: Pick<PageProps<'/events/[eventId]/promotion'>, 'params'>) {
  const { eventId } = await params;
  const [event, state, canManage, mila, t] = await Promise.all([
    getEvent(eventId),
    getPromotionState(eventId),
    canManageEvent(eventId),
    getMilaContext(eventId),
    getTranslations('promotion'),
  ]);
  const readOnly = event.status === 'archived';
  // "Today" belongs to the request: tell Next.js before reading the clock.
  await connection();
  const board = (
    <PromotionBoard
      eventId={eventId}
      state={state}
      eventStartDate={utcIsoToBrussels(event.startsAt).date}
      today={todayInBrussels()}
    />
  );

  return (
    <div className="flex flex-col gap-5">
      {readOnly && <FormError message={t('readOnly')} />}
      {mila ? <TasksProvider value={mila.tasks}>{board}</TasksProvider> : board}
      <AudienceCard
        eventId={eventId}
        state={state}
        expectedAttendance={event.expectedAttendance}
        canEdit={canManage && !readOnly}
      />
    </div>
  );
}
