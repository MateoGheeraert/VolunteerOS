import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { getMilaContext } from '@/features/ai/mila-context';
import { EventStatusBanner } from '@/features/events/event-status-banner';
import { AskMila } from '@/features/overview/ask-mila';
import { BudgetCard } from '@/features/overview/budget-card';
import { CountdownCard } from '@/features/overview/countdown-card';
import { OverviewHeader } from '@/features/overview/overview-header';
import { PlanningCard } from '@/features/overview/planning-card';
import { TasksCard } from '@/features/overview/tasks-card';
import { TasksProvider } from '@/features/tasks/tasks-context';
import { canManageEvent, getEvent, getEventOverview } from '@/server/events/queries';

export default function EventOverviewPage({ params }: PageProps<'/events/[eventId]'>) {
  return (
    <Suspense fallback={<OverviewSkeleton />}>
      <EventOverview params={params} />
    </Suspense>
  );
}

/**
 * One page per event that shows at a glance what still needs attention (docs/info.md §7.2): the
 * essentials under the title, then a card per module in a fixed order. Mila speaks inside the
 * cards (at most one highlighted hint) and opens in full from "Vraag Mila".
 */
async function EventOverview({ params }: Pick<PageProps<'/events/[eventId]'>, 'params'>) {
  const { eventId } = await params;
  const [event, overview, canManage, mila] = await Promise.all([
    getEvent(eventId),
    getEventOverview(eventId),
    canManageEvent(eventId),
    getMilaContext(eventId),
  ]);
  const cards = { eventId, overview, canManage };

  // Desktop: the small cards (countdown, budget) stack on the left, the large ones (tasks,
  // planning) on the right, so no card stretches to its neighbour's height. On mobile the
  // columns dissolve (`contents`) and `order` keeps the fixed card order.
  const grid = (
    <div className="flex flex-col gap-5 lg:grid lg:grid-cols-3 lg:items-start">
      <div className="contents lg:flex lg:flex-col lg:gap-5">
        <CountdownCard {...cards} className="order-1" />
        <BudgetCard {...cards} className="order-4" />
      </div>
      <div className="contents lg:col-span-2 lg:flex lg:flex-col lg:gap-5">
        <TasksCard {...cards} className="order-2" />
        <PlanningCard {...cards} className="order-3" />
      </div>
    </div>
  );

  return (
    <>
      <OverviewHeader
        event={event}
        canManage={canManage}
        askMila={
          mila?.state.enabled && (
            <AskMila
              state={mila.state}
              tasks={mila.tasks}
              openQuestions={overview.mila.openQuestions}
            />
          )
        }
      />
      {/* Only those who may change the status get Mila's suggestion to. */}
      {canManage && <EventStatusBanner event={event} />}
      {/* Mila's helpers in the cards create tasks with the event's task context. */}
      {mila ? <TasksProvider value={mila.tasks}>{grid}</TasksProvider> : grid}
    </>
  );
}

function OverviewSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <Skeleton className="h-6 w-96 max-w-full bg-card" />
      <div className="grid gap-5 lg:grid-cols-3">
        <Skeleton className="h-80 rounded-card bg-card" />
        <Skeleton className="h-80 rounded-card bg-card lg:col-span-2" />
        <Skeleton className="h-80 rounded-card bg-card lg:col-span-2" />
        <Skeleton className="h-80 rounded-card bg-card" />
      </div>
    </div>
  );
}
