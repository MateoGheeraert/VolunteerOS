import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { MILA_NAME, MilaAvatar } from './mila-avatar';

/** "Mila denkt na…" with bouncing dots; announced to screen readers as a status. */
export function MilaThinking({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <output className={cn('flex items-center gap-2 text-sm font-bold text-mila', className)}>
      <span aria-hidden className="flex gap-1">
        {[0, 150, 300].map((delay) => (
          <span
            key={delay}
            className="size-1.5 animate-bounce rounded-full bg-mila"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </span>
      {children}
    </output>
  );
}

/**
 * Marks something as coming from Mila anywhere in the app (a task she suggested, a filled-in
 * field): her small face and a label, in her colors.
 */
export function MilaBadge({
  label = MILA_NAME,
  className,
}: {
  label?: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full bg-mila-tint py-0.5 pr-2.5 pl-0.5 text-xs font-bold text-mila-ink',
        className,
      )}
    >
      <MilaAvatar size="xs" />
      {label}
    </span>
  );
}
