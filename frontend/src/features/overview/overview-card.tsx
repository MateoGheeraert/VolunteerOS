import { ArrowRight, type LucideIcon } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { IconBlob } from '@/components/layout/icon-blob';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { CardStatus } from './overview-types';

/** A status color's icon tone; a neutral card (nothing to judge yet) stays in the brand color. */
export const statusTone = (status: CardStatus) => (status === 'neutral' ? 'brand' : status);

/**
 * One card of the event overview: an icon in its status color, the title (a link to the module),
 * the status as a badge, and a "Bekijk …" link at the bottom. No colored borders: the badge, the
 * icon and the main bar carry the status.
 */
export async function OverviewCard({
  title,
  icon,
  status,
  href,
  viewLabel,
  className,
  children,
}: {
  title: string;
  icon: LucideIcon;
  status: CardStatus;
  /** The module's page; omitted for a card that has none (the countdown). */
  href?: string;
  viewLabel?: string;
  className?: string;
  children: ReactNode;
}) {
  const t = await getTranslations('overview.status');
  return (
    <section
      className={cn(
        'flex min-w-0 flex-col gap-3 rounded-card bg-card p-4 shadow-soft sm:p-5',
        className,
      )}
    >
      <header className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <IconBlob icon={icon} tone={statusTone(status)} className="size-8 [&>svg]:size-4" />
          <h2 className="truncate text-base">
            {href ? (
              <Link href={href} className="underline-offset-4 hover:underline">
                {title}
              </Link>
            ) : (
              title
            )}
          </h2>
        </div>
        {status !== 'neutral' && <Badge variant={status}>{t(status)}</Badge>}
      </header>
      <div className="flex flex-1 flex-col gap-3">{children}</div>
      {href && viewLabel && (
        <Link
          href={href}
          className="inline-flex items-center gap-1.5 self-start text-sm font-bold text-brand-primary-bright underline-offset-4 hover:underline"
        >
          {viewLabel}
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      )}
    </section>
  );
}

/**
 * Small counts in one line ("3 niemand op gezet · 1 te laat"); zero counts are left out, so
 * only what needs attention shows.
 */
export function Counts({
  items,
}: {
  items: { key: string; label: string; value: number; tone?: 'bad' | 'warn' }[];
}) {
  const shown = items.filter((item) => item.value > 0);
  if (shown.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
      {shown.map((item) => (
        <li
          key={item.key}
          className={cn(
            'font-bold',
            item.tone === 'bad' && 'text-status-bad',
            item.tone === 'warn' && 'text-status-warn',
          )}
        >
          <span className="tabular-nums">{item.value}</span>{' '}
          <span className={cn(!item.tone && 'text-muted-foreground')}>{item.label}</span>
        </li>
      ))}
    </ul>
  );
}

/** A small number with its label, for a card's key counts. */
export function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: ReactNode;
  tone?: 'bad' | 'warn' | 'muted';
}) {
  return (
    <div className="flex min-w-0 flex-col rounded-card bg-muted/60 px-3 py-2">
      <span
        className={cn(
          'text-xl font-extrabold tabular-nums',
          tone === 'bad' && 'text-status-bad',
          tone === 'warn' && 'text-status-warn',
          tone === 'muted' && 'text-muted-foreground',
        )}
      >
        {value}
      </span>
      <span className="truncate text-xs font-bold text-muted-foreground">{label}</span>
    </div>
  );
}

/**
 * One bar split in parts (done / busy / to do, confirmed / proposed / open), with a legend. The
 * bar only illustrates the headline above it and the legend's numbers, so screen readers skip it.
 */
export function SegmentBar({
  segments,
}: {
  segments: { key: string; label: string; value: number; className: string }[];
}) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  return (
    <div className="flex flex-col gap-1.5">
      <div aria-hidden className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
        {total > 0 &&
          segments.map((segment) =>
            segment.value > 0 ? (
              <span
                key={segment.key}
                className={cn('h-full', segment.className)}
                style={{ width: `${(segment.value / total) * 100}%` }}
              />
            ) : null,
          )}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-bold text-muted-foreground">
        {segments.map((segment) => (
          <li key={segment.key} className="flex items-center gap-1.5">
            <span aria-hidden className={cn('size-2.5 rounded-full', segment.className)} />
            {segment.label} <span className="tabular-nums text-foreground">{segment.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The fill of a card's main bar in its status color. */
export const statusFill: Record<CardStatus, string> = {
  ok: 'bg-status-ok',
  warn: 'bg-status-warn',
  bad: 'bg-status-bad',
  neutral: 'bg-brand-secondary',
};

/** An empty card: what's missing and one next step. */
export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col items-start justify-center gap-1.5">
      <p className="text-sm font-bold">{title}</p>
      <p className="text-sm text-muted-foreground">{body}</p>
      {action && <div className="pt-1">{action}</div>}
    </div>
  );
}
