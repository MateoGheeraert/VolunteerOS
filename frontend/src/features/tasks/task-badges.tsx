import { ArrowDown, ArrowUp, Equal } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { TaskLabel } from '@/api/generated/types.gen';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { LabelColor, TaskPriority, TaskStatus } from './schemas';

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

/** Label tints from a fixed palette. Red stays reserved for "overdue", so it is a soft rose. */
export const labelColorClasses: Record<LabelColor, string> = {
  gray: 'bg-stone-100 text-stone-700',
  red: 'bg-rose-100 text-rose-800',
  orange: 'bg-orange-100 text-orange-800',
  yellow: 'bg-amber-100 text-amber-800',
  green: 'bg-emerald-100 text-emerald-800',
  teal: 'bg-teal-100 text-teal-800',
  blue: 'bg-sky-100 text-sky-800',
  purple: 'bg-violet-100 text-violet-800',
};

export function LabelChip({
  label,
  className,
}: {
  label: Pick<TaskLabel, 'name' | 'color'>;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center rounded-full px-2.5 text-xs font-bold whitespace-nowrap',
        labelColorClasses[label.color],
        className,
      )}
    >
      {label.name}
    </span>
  );
}
