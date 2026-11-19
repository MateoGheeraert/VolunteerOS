import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * One thing Mila proposes (a task, a value for a field, …): a white card on her lavender panel,
 * with her reasoning in her ink color. Lay out the content as children; `reason` is her
 * explanation, `sources` what it is based on, `actions` the buttons that decide on it.
 * Renders an `li`: put it in a `ul` (MilaSuggestionList).
 */
export function MilaSuggestion({
  reason,
  sources,
  actions,
  className,
  children,
}: {
  reason?: ReactNode;
  sources?: ReactNode;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <li className={cn('flex flex-col gap-3 rounded-2xl bg-card p-4 shadow-soft', className)}>
      {children}
      {reason && <p className="text-sm text-mila-ink">{reason}</p>}
      {sources}
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </li>
  );
}

export function MilaSuggestionList({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <ul className={cn('flex flex-col gap-3', className)}>{children}</ul>;
}
