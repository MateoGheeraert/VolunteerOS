'use client';

import { PencilLine, X } from 'lucide-react';
import { useAction } from 'next-safe-action/hooks';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { MilaBadge, MilaSuggestion } from '@/components/mila';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Citations } from '@/features/ai/suggestion-cards';
import { useActionFeedback } from '@/features/tasks/tasks-context';
import { formatDay } from '@/lib/format';
import { formatCents } from '@/lib/money';
import { rejectSuggestion } from '@/server/ai/actions';
import type { PromoAction } from './schemas';

/**
 * One action of Mila's promotion plan: what, for whom, when, what it costs and how much work it
 * is, why she proposes it and how to do it. Tick it to add it with others, or open it to adjust.
 */
export function PromoActionCard({
  eventId,
  action,
  selected,
  onSelectedChange,
  onEdit,
  disabled,
  marker,
}: {
  eventId: string;
  action: PromoAction;
  /** Its dot on the timeline. */
  marker?: ReactNode;
  selected: boolean;
  onSelectedChange: (selected: boolean) => void;
  onEdit: () => void;
  disabled: boolean;
}) {
  const t = useTranslations('promotion');
  const ta = useTranslations('ai');
  const feedback = useActionFeedback();
  const reject = useAction(rejectSuggestion.bind(null, eventId, action.id), feedback);
  const { payload } = action;
  const checkboxId = `promo-${action.id}`;

  return (
    <MilaSuggestion
      className="relative rounded-xl border-2 border-dashed border-mila-tint-strong bg-mila-tint/40 shadow-none"
      reason={action.explanation}
      sources={<Citations citations={action.citations} />}
      actions={
        <>
          <Button size="sm" variant="mila-soft" onClick={onEdit} disabled={disabled}>
            <PencilLine aria-hidden />
            {ta('editAndAdd')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => reject.execute()}
            disabled={disabled || reject.isPending}
          >
            <X aria-hidden />
            {ta('notNeeded')}
          </Button>
        </>
      }
    >
      {marker}
      <MilaBadge label={t('timeline.suggestion')} className="self-start" />
      <div className="flex items-start gap-3">
        <input
          id={checkboxId}
          type="checkbox"
          className="mt-1 size-4 accent-mila"
          checked={selected}
          disabled={disabled}
          onChange={(event) => onSelectedChange(event.target.checked)}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <label htmlFor={checkboxId} className="font-bold">
            {payload.title}
          </label>
          <div className="flex flex-wrap items-center gap-1.5 text-sm">
            <Badge variant="brand">{t(`action.type.${payload.type}`)}</Badge>
            <Badge variant="outline">{t(`action.effort.${payload.effort}`)}</Badge>
            <Badge variant="outline">
              {payload.estimatedCostCents === 0
                ? t('action.free')
                : formatCents(payload.estimatedCostCents)}
            </Badge>
            <span className="text-muted-foreground">
              {ta('dueBy', { date: formatDay(payload.dueDate) })}
            </span>
          </div>
          {payload.audience && (
            <p className="text-sm text-muted-foreground">
              {t('action.audience', { audience: payload.audience })}
            </p>
          )}
          <details className="text-sm">
            <summary className="cursor-pointer font-bold text-mila-ink">
              {t('action.howTo')}
            </summary>
            <p className="mt-1.5 whitespace-pre-line text-muted-foreground">{payload.howTo}</p>
          </details>
        </div>
      </div>
    </MilaSuggestion>
  );
}
