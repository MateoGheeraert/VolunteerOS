import { ArrowDown, ArrowUp, Equal } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { TaskPriority, TaskStatus } from './schemas';

const statusVariants = {
  todo: 'outline',
  in_progress: 'brand',
  done: 'ok',
} as const satisfies Record<TaskStatus, string>;

/** The status, in the red status color when the task is overdue. */
export function TaskStatusBadge({ status, overdue }: { status: TaskStatus; overdue: boolean }) {
  const t = useTranslations();
  if (overdue) {
    return (
      <Badge variant="bad">
        {t(`taskStatus.${status}`)} · {t('tasks.overdue')}
      </Badge>
    );
  }
  return <Badge variant={statusVariants[status]}>{t(`taskStatus.${status}`)}</Badge>;
}

const priorityIcons = { high: ArrowUp, medium: Equal, low: ArrowDown } as const;

export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  const t = useTranslations();
  const Icon = priorityIcons[priority];
  return (
    <Badge
      variant={priority === 'high' ? 'warn' : 'secondary'}
      title={t('taskForm.priority')}
      className={cn(priority === 'low' && 'bg-transparent text-muted-foreground')}
    >
      <Icon aria-hidden />
      {t(`taskPriority.${priority}`)}
    </Badge>
  );
}
