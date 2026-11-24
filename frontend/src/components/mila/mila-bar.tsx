import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { MilaAvatar } from './mila-avatar';

/**
 * Mila in one line, for pages where the content itself matters most (the task board): her face,
 * a short message, and her actions. Opens her full suggestions elsewhere (a side panel).
 */
export function MilaBar({
  message,
  detail,
  actions,
  thinking = false,
  className,
}: {
  message: ReactNode;
  detail?: ReactNode;
  actions?: ReactNode;
  thinking?: boolean;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-card border border-mila-tint-strong/60 bg-mila-tint px-4 py-3',
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <MilaAvatar size="sm" thinking={thinking} />
        <div className="flex min-w-0 flex-col">
          <p className="text-sm font-bold text-mila-ink">{message}</p>
          {detail && <p className="text-xs text-mila-ink/75">{detail}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </section>
  );
}
