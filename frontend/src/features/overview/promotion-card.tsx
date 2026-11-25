import { Megaphone, Sparkles } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { formatDay } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Counts, EmptyState, OverviewCard } from './overview-card';
import type { OverviewCardProps } from './overview-types';

/**
 * Promotie (docs/info.md §7.11): the open and overdue Promotie tasks and the next one, or Mila's
 * offer to make a plan when there is none yet. Red when a Promotie task is overdue.
 */
export async function PromotionCard({
  eventId,
  overview,
  canManage,
  className,
}: OverviewCardProps) {
  const t = await getTranslations('overview.promotion');
  const { promotion, phase } = overview;
  const href = `/events/${eventId}/promotion`;
  const card = {
    title: t('title'),
    icon: Megaphone,
    status: promotion.status,
    href,
    viewLabel: t('view'),
    className,
  };
  const total = promotion.open + promotion.done;

  if (total === 0) {
    const offerPlan = canManage && phase === 'before' && !promotion.hasPlan;
    return (
      <OverviewCard {...card}>
        <EmptyState
          title={t('emptyTitle')}
          body={
            phase === 'after'
              ? t('emptyAfter')
              : overview.mila.enabled
                ? t('emptyBody')
                : t('emptyBodyNoMila')
          }
          action={
            offerPlan && (
              <Button asChild size="sm" variant={overview.mila.enabled ? 'mila' : 'default'}>
                <Link href={href}>
                  <Sparkles aria-hidden />
                  {t('emptyAction')}
                </Link>
              </Button>
            )
          }
        />
        {promotion.pendingActions > 0 && (
          <Link
            href={href}
            className="text-sm font-bold text-mila underline-offset-4 hover:underline"
          >
            {t('pending', { count: promotion.pendingActions })}
          </Link>
        )}
      </OverviewCard>
    );
  }

  const { next } = promotion;
  return (
    <OverviewCard {...card}>
      <p className="text-base font-extrabold">
        {promotion.open > 0 ? t('headline', { open: promotion.open }) : t('allDone')}
      </p>
      <Counts
        items={[
          { key: 'overdue', label: t('overdue'), value: promotion.overdue, tone: 'bad' },
          { key: 'done', label: t('done'), value: promotion.done },
        ]}
      />
      {next && (
        <div className="flex flex-col gap-0.5 rounded-card bg-muted/60 px-3 py-2">
          <span className="text-xs font-bold text-muted-foreground">{t('next')}</span>
          <span className="truncate text-sm font-bold">{next.title}</span>
          <span
            className={cn(
              'text-xs font-bold',
              next.overdue ? 'text-status-bad' : 'text-muted-foreground',
            )}
          >
            {next.dueDate ? t('dueOn', { date: formatDay(next.dueDate) }) : t('noDate')}
          </span>
        </div>
      )}
      {promotion.pendingActions > 0 ? (
        <Link
          href={href}
          className="text-sm font-bold text-mila underline-offset-4 hover:underline"
        >
          {t('pending', { count: promotion.pendingActions })}
        </Link>
      ) : (
        // Own actions only, no plan from Mila yet: she can still make one.
        canManage &&
        phase === 'before' &&
        overview.mila.enabled &&
        !promotion.hasPlan && (
          <Link
            href={href}
            className="flex items-center gap-1.5 text-sm font-bold text-mila underline-offset-4 hover:underline"
          >
            <Sparkles className="size-4" aria-hidden />
            {t('planAction')}
          </Link>
        )
      )}
    </OverviewCard>
  );
}
