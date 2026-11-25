import { ListChecks } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { formatDay } from '@/lib/format';
import { cn } from '@/lib/utils';
import { MilaFindingTasks, MilaHint } from './mila-hint';
import { Counts, EmptyState, OverviewCard, SegmentBar } from './overview-card';
import { hintFor, type OverviewCardProps } from './overview-types';

/**
 * Tasks: how many are done, who is on what, what is late, and the next ones to look at. Mila
 * speaks here when she has something concrete; on an empty card she is the empty state.
 */
export async function TasksCard({ eventId, overview, canManage, className }: OverviewCardProps) {
  const t = await getTranslations('overview.tasks');
  const { tasks, mila } = overview;
  const href = `/events/${eventId}/tasks`;
  const hint = hintFor(overview, 'tasks');
  const milaHint = hint && (
    <MilaHint
      // A new key when the hint changes or gets highlighted: it opens or closes accordingly.
      key={`${hint.key}:${hint.fingerprint}:${hint.highlighted}`}
      eventId={eventId}
      hint={hint}
      pendingTaskSuggestions={mila.pendingTaskSuggestions}
    />
  );
  const finding = mila.enabled && mila.findingTasks && <MilaFindingTasks />;

  if (tasks.total === 0) {
    return (
      <OverviewCard
        title={t('title')}
        icon={ListChecks}
        status={tasks.status}
        href={href}
        viewLabel={t('view')}
        className={className}
      >
        {finding}
        {/*
          Highlighted, Mila is the empty state. Otherwise (the status banner speaks for her, or she
          can't help) the card shows its own next step, with her chip below it.
        */}
        {hint?.highlighted ? (
          milaHint
        ) : (
          <>
            <EmptyState
              title={t('emptyTitle')}
              body={
                overview.phase === 'after'
                  ? t('emptyAfter')
                  : canManage
                    ? t('emptyBody')
                    : t('emptyMember')
              }
              action={
                canManage &&
                overview.phase !== 'after' && (
                  <Button asChild size="sm">
                    <Link href={href}>{t('emptyAction')}</Link>
                  </Button>
                )
              }
            />
            {milaHint}
          </>
        )}
      </OverviewCard>
    );
  }

  const headline = t('headline', { done: tasks.done, total: tasks.total });
  return (
    <OverviewCard
      title={t('title')}
      icon={ListChecks}
      status={tasks.status}
      href={href}
      viewLabel={t('view')}
      className={className}
    >
      <div className="flex flex-col gap-2">
        <p className="text-lg font-extrabold">{headline}</p>
        <SegmentBar
          segments={[
            {
              key: 'done',
              label: t('done'),
              value: tasks.done,
              // Done is always green; the badge and icon carry the card's status.
              className: 'bg-status-ok',
            },
            {
              key: 'inProgress',
              label: t('inProgress'),
              value: tasks.inProgress,
              className: 'bg-brand-tint-strong',
            },
            { key: 'todo', label: t('todo'), value: tasks.todo, className: 'bg-muted' },
          ]}
        />
      </div>

      <Counts
        items={[
          { key: 'overdue', label: t('overdue'), value: tasks.overdue, tone: 'bad' },
          { key: 'unassigned', label: t('unassigned'), value: tasks.unassigned },
        ]}
      />

      {tasks.next.length > 0 && (
        <ul className="flex flex-col divide-y divide-border">
          {tasks.next.map((task) => (
            <li key={task.id} className="flex items-center justify-between gap-3 py-1.5 text-sm">
              <span className="flex min-w-0 items-baseline gap-2">
                <Link href={href} className="truncate font-bold underline-offset-4 hover:underline">
                  {task.title}
                </Link>
                {task.assigneeName && (
                  <span className="hidden truncate text-xs text-muted-foreground sm:inline">
                    {task.assigneeName}
                  </span>
                )}
              </span>
              <span
                className={cn(
                  'shrink-0 text-xs font-bold',
                  task.overdue ? 'text-status-bad' : 'text-muted-foreground',
                )}
              >
                {task.dueDate === null
                  ? t('noDueDate')
                  : task.overdue
                    ? t('overdueSince', { date: formatDay(task.dueDate) })
                    : t('due', { date: formatDay(task.dueDate) })}
              </span>
            </li>
          ))}
        </ul>
      )}

      {tasks.pendingRequests > 0 && (
        <Link
          href={href}
          className="text-sm font-bold text-status-warn underline-offset-4 hover:underline"
        >
          {t('requests', { count: tasks.pendingRequests })}
        </Link>
      )}

      {finding}
      {milaHint}
    </OverviewCard>
  );
}
