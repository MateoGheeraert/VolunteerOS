import type { Label } from '@/api/generated/types.gen';
import { cn } from '@/lib/utils';
import type { LabelColor } from './schemas';

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
  label: Pick<Label, 'name' | 'color'>;
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

/** The labels with these ids, in the order of `labels` (by name); unknown ids are skipped. */
export function labelsOf<L extends { id: string }>(labels: L[], ids: string[]): L[] {
  return labels.filter((label) => ids.includes(label.id));
}
