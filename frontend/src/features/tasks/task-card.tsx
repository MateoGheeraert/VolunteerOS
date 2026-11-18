'use client';

import { CalendarClock, Hand, UserRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ComponentProps } from 'react';
import type { TaskAssignee } from '@/api/generated/types.gen';
import { Badge } from '@/components/ui/badge';
import { formatDay } from '@/lib/format';
import { cn } from '@/lib/utils';
import { LabelChip, PriorityBadge, TaskStatusBadge } from './task-badges';
import { assigneeUserId, isOverdue } from './task-rules';
import { useTasksContext, type ShownTask } from './tasks-context';

/**
 * One task as a card on the board or a row in the list. The whole card is one button: a click
 * (or Enter) opens the task, and on the board the same card is what you drag. Everything you can
 * do with a task is in the pane it opens, so the card holds no buttons of its own.
 */
export function TaskCard({
  task,
  onOpen,
  showStatus = true,
  className,
  ...props
}: {
  task: ShownTask;
  onOpen: () => void;
  /** The board's columns already say the status; the badge still shows when overdue. */
  showStatus?: boolean;
} & Omit<ComponentProps<'button'>, 'onClick' | 'children' | 'type'>) {
  const t = useTranslations();
  const { labels, today, canManage, userId, mode } = useTasksContext();
  const overdue = isOverdue(task, today);
  const taskLabels = task.labelIds
    .map((id) => labels.find((label) => label.id === id))
    .filter((label) => label !== undefined);
  const myRequest = task.pendingRequests.some((request) => request.userId === userId);

  // A real button (Enter and Space open it), so everything inside is inline content.
  return (
    <button
      type="button"
      {...props}
      onClick={onOpen}
      className={cn(
        'flex w-full cursor-pointer flex-col gap-3 rounded-2xl border-2 border-transparent bg-card p-4 text-left shadow-soft outline-none select-none hover:border-brand-tint-strong/50 focus-visible:ring-[3px] focus-visible:ring-ring/50',
        overdue && 'border-status-bad/40 hover:border-status-bad/60',
        className,
      )}
    >
      <span className="flex min-w-0 flex-col gap-1">
        {mode === 'mine' && task.event && (
          <span className="text-xs font-bold tracking-wide text-primary uppercase">
            {task.event.name}
          </span>
        )}
        <span className="font-bold">{task.title}</span>
        {task.description && (
          <span className="line-clamp-2 text-sm whitespace-pre-line text-muted-foreground">
            {task.description}
          </span>
        )}
      </span>

      {taskLabels.length > 0 && (
        <span className="flex flex-wrap gap-1.5">
          {taskLabels.map((label) => (
            <LabelChip key={label.id} label={label} />
          ))}
        </span>
      )}

      <span className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
        {(showStatus || overdue) && <TaskStatusBadge status={task.status} overdue={overdue} />}
        <PriorityBadge priority={task.priority} />
        {task.dueDate && (
          <span
            className={cn(
              'inline-flex items-center gap-1 font-semibold',
              overdue ? 'text-status-bad' : 'text-muted-foreground',
            )}
          >
            <CalendarClock className="size-4" aria-hidden />
            {formatDay(task.dueDate)}
          </span>
        )}
        <AssigneeName assignee={task.assignee} isMe={assigneeUserId(task) === userId} />
        {canManage && task.pendingRequests.length > 0 && (
          <Badge variant="new">
            <Hand aria-hidden />
            {t('tasks.requestCount', { count: task.pendingRequests.length })}
          </Badge>
        )}
        {!canManage && myRequest && <Badge variant="brand">{t('tasks.requestPending')}</Badge>}
      </span>
    </button>
  );
}

export function AssigneeName({ assignee, isMe }: { assignee: TaskAssignee | null; isMe: boolean }) {
  const t = useTranslations();
  if (!assignee) {
    return <span className="text-muted-foreground italic">{t('tasks.unassigned')}</span>;
  }
  return (
    <span className="inline-flex min-w-0 items-center gap-1 font-semibold">
      <UserRound className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="truncate">{isMe ? t('tasks.you') : assignee.name}</span>
      {assignee.type === 'external' && (
        <span className="font-normal text-muted-foreground">({t('tasks.noAccount')})</span>
      )}
      {assignee.type === 'member' && !assignee.active && (
        <Badge variant="secondary">{t('tasks.inactive')}</Badge>
      )}
    </span>
  );
}
