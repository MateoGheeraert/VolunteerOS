import { Wallet } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { formatCents } from '@/lib/money';
import { cn } from '@/lib/utils';
import { MilaHint, MilaReviewingBudget } from './mila-hint';
import { BudgetChart } from './overview-charts';
import { EmptyState, OverviewCard, statusFill } from './overview-card';
import { hintFor, type OverviewCardProps } from './overview-types';

/** "+€ 200,00" / "−€ 420,00": the sign says which way the result goes. */
const signed = (cents: number) => `${cents < 0 ? '−' : '+'}${formatCents(Math.abs(cents))}`;

/**
 * Budget: before and during the event, what is spent against the estimate and the expected
 * result; after it, the result itself (actual income against actual costs). Mila speaks here
 * when she can help: a first draft on an empty budget, or the lines she found missing.
 */
export async function BudgetCard({ eventId, overview, canManage, className }: OverviewCardProps) {
  const t = await getTranslations('overview.budget');
  const { budget, phase, mila } = overview;
  const hint = hintFor(overview, 'budget');
  const milaHint = hint && (
    <MilaHint
      // A new key when the hint changes or gets highlighted: it opens or closes accordingly.
      key={`${hint.key}:${hint.fingerprint}:${hint.highlighted}`}
      eventId={eventId}
      hint={hint}
      pendingBudgetLines={{
        count: mila.pendingBudgetLines,
        fromPreviousEdition: mila.pendingBudgetLinesFromPreviousEdition,
      }}
    />
  );
  const reviewing = mila.enabled && mila.reviewingBudget && <MilaReviewingBudget />;
  const href = `/events/${eventId}/budget`;
  const card = {
    title: t('title'),
    icon: Wallet,
    status: budget.status,
    href,
    viewLabel: t('view'),
    className,
  };

  if (budget.entryCount === 0) {
    return (
      <OverviewCard {...card}>
        {reviewing}
        {/* Highlighted, Mila is the empty state; otherwise her chip sits below it. */}
        {hint?.highlighted ? (
          milaHint
        ) : (
          <>
            <EmptyState
              title={t('emptyTitle')}
              body={phase === 'after' ? t('emptyAfter') : t('emptyBody')}
              action={
                canManage &&
                phase !== 'after' && (
                  <Button asChild size="sm">
                    <Link href={href}>{t('emptyAction')}</Link>
                  </Button>
                )
              }
            />
            {milaHint}
          </>
        )}
      </OverviewCard>
    );
  }

  const chart = (
    <BudgetChart
      expense={budget.expense}
      income={budget.income}
      labels={{
        estimated: t('estimated'),
        actual: t('actual'),
        expense: t('expense'),
        income: t('income'),
      }}
    />
  );
  const suppliers = budget.supplierCount > 0 && (
    <p className="text-xs text-muted-foreground">
      {t('suppliers', { count: budget.supplierCount })}
    </p>
  );

  if (phase === 'after') {
    return (
      <OverviewCard {...card}>
        <div className="flex flex-col gap-1">
          <span className="text-sm font-bold text-muted-foreground">{t('result')}</span>
          <span
            className={cn(
              'text-2xl font-extrabold tabular-nums',
              budget.result.actual < 0 ? 'text-status-bad' : 'text-status-ok',
            )}
          >
            {signed(budget.result.actual)}
          </span>
        </div>
        {chart}
        {suppliers}
      </OverviewCard>
    );
  }

  const { estimated, actual } = budget.expense;
  const headline =
    estimated > 0
      ? t('headline', { spent: formatCents(actual), estimated: formatCents(estimated) })
      : t('headlineNoEstimate', { spent: formatCents(actual) });
  const share = estimated > 0 ? Math.min(1, actual / estimated) : 0;

  return (
    <OverviewCard {...card}>
      <div className="flex flex-col gap-2">
        <p className="text-base font-extrabold">{headline}</p>
        {estimated > 0 && (
          <div aria-hidden className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
            <span
              className={cn('block h-full rounded-full', statusFill[budget.status])}
              style={{ width: `${share * 100}%` }}
            />
          </div>
        )}
      </div>
      <dl className="grid gap-1 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="font-bold text-muted-foreground">{t('income')}</dt>
          <dd className="text-right tabular-nums">
            {t('incomeLine', {
              actual: formatCents(budget.income.actual),
              estimated: formatCents(budget.income.estimated),
            })}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="font-bold text-muted-foreground">{t('projected')}</dt>
          <dd
            className={cn(
              'font-bold tabular-nums',
              budget.result.estimated < 0 ? 'text-status-bad' : 'text-status-ok',
            )}
          >
            {signed(budget.result.estimated)}
          </dd>
        </div>
      </dl>
      {chart}
      {suppliers}
      {reviewing}
      {milaHint}
    </OverviewCard>
  );
}
