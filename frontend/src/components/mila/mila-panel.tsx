import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { MILA_NAME, MilaAvatar } from './mila-avatar';

/**
 * Mila's corner of a page: a lavender surface with her face, name and a line about what she does
 * here. `action` sits on the right (e.g. "Stel taken voor"); everything she proposes goes inside.
 */
export function MilaPanel({
  subtitle,
  action,
  thinking = false,
  title = MILA_NAME,
  className,
  children,
}: {
  subtitle?: ReactNode;
  action?: ReactNode;
  thinking?: boolean;
  title?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <section
      className={cn(
        'flex flex-col gap-4 rounded-card border border-mila-tint-strong/60 bg-mila-tint p-5 sm:p-6',
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <MilaAvatar thinking={thinking} />
          <div className="flex flex-col">
            <h2 className="text-lg text-mila-ink">{title}</h2>
            {subtitle && <p className="text-sm text-mila-ink/75">{subtitle}</p>}
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
