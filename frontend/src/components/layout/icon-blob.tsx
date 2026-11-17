import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

const tones = {
  brand: 'bg-brand-tint text-primary',
  accent: 'bg-brand-accent/20 text-brand-accent-ink',
  ok: 'bg-status-ok-bg text-status-ok',
  warn: 'bg-status-warn-bg text-status-warn',
  bad: 'bg-status-bad-bg text-status-bad',
} as const;

/** A Lucide icon in a soft colored circle: empty states, cards and section headers. */
export function IconBlob({
  icon: Icon,
  tone = 'brand',
  size = 'md',
  className,
}: {
  icon: LucideIcon;
  tone?: keyof typeof tones;
  size?: 'md' | 'lg';
  className?: string;
}) {
  return (
    <span
      className={cn(
        'grid shrink-0 place-items-center rounded-full',
        size === 'lg' ? 'size-16' : 'size-10',
        tones[tone],
        className,
      )}
    >
      <Icon className={size === 'lg' ? 'size-7' : 'size-5'} aria-hidden />
    </span>
  );
}
