import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { MilaAvatar } from './mila-avatar';

/**
 * Mila speaking: her face with a speech bubble. For her questions and short messages; put answer
 * options or a reply form in `children`. Renders an `li` when `asListItem` is set.
 */
export function MilaBubble({
  message,
  detail,
  asListItem = false,
  className,
  children,
}: {
  message: ReactNode;
  detail?: ReactNode;
  asListItem?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const Root = asListItem ? 'li' : 'div';
  return (
    <Root className={cn('flex items-start gap-3', className)}>
      <MilaAvatar size="sm" className="mt-1" />
      <div className="flex min-w-0 flex-1 flex-col gap-3 rounded-2xl rounded-tl-sm bg-card p-4 shadow-soft">
        <div className="flex flex-col gap-1">
          <p className="font-bold text-mila-ink">{message}</p>
          {detail && <p className="text-sm text-muted-foreground">{detail}</p>}
        </div>
        {children}
      </div>
    </Root>
  );
}
