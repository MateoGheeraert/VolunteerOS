'use client';

import { CornerDownLeft } from 'lucide-react';
import { useAction } from 'next-safe-action/hooks';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useRef, useState, type KeyboardEvent } from 'react';
import type { Label } from '@/api/generated/types.gen';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LabelPopover } from '@/features/labels/label-popover';
import type { MessageKey } from '@/i18n/keys';
import { cn } from '@/lib/utils';
import { createBudgetEntry } from '@/server/budget/actions';
import {
  budgetEntryFormSchema,
  effectiveType,
  emptyBudgetEntry,
  type BudgetEntryType,
} from './schemas';

type Field = 'title' | 'estimated' | 'actual';

/**
 * The row at the top of the budget to type a new line straight into the list: + or −, a
 * description, labels and an amount or two, then Enter. The line is added and the cursor is back
 * in the description for the next one. The + / − button keeps what was chosen there; a sign
 * typed in an amount only applies to that one line. A task, notes and files are added
 * afterwards in the line's modal.
 */
export function BudgetQuickAdd({ eventId, labels }: { eventId: string; labels: Label[] }) {
  const t = useTranslations();
  const router = useRouter();
  const titleRef = useRef<HTMLInputElement>(null);
  const [type, setType] = useState<BudgetEntryType>('expense');
  const [title, setTitle] = useState('');
  const [estimated, setEstimated] = useState('');
  const [actual, setActual] = useState('');
  const [labelIds, setLabelIds] = useState<string[]>([]);
  const [error, setError] = useState<{ field: Field; message: MessageKey } | null>(null);

  const create = useAction(createBudgetEntry.bind(null, eventId), {
    onSuccess: () => {
      setTitle('');
      setEstimated('');
      setActual('');
      setLabelIds([]);
      setError(null);
      titleRef.current?.focus();
      router.refresh();
    },
    onError: ({ error: actionError }) =>
      setError({
        field: 'title',
        message: actionError.serverError?.message ?? 'common.genericError',
      }),
  });

  const add = () => {
    if (create.isPending) return;
    const parsed = budgetEntryFormSchema.safeParse({
      ...emptyBudgetEntry(type),
      title,
      estimated,
      actual,
      // Labels deleted since they were picked are left out: the API refuses them.
      labelIds: labelIds.filter((id) => labels.some((label) => label.id === id)),
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      const path = issue.path[0];
      const field: Field = path === 'estimated' || path === 'actual' ? path : 'title';
      setError({ field, message: issue.message as MessageKey });
      return;
    }
    setError(null);
    create.execute(parsed.data);
  };
  const onEnter = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      add();
    }
  };

  // A typed sign ("-500", "+500") decides, so the button shows what the line will become.
  const isIncome = effectiveType({ type, estimated, actual }) === 'income';
  const typeLabel = isIncome ? t('budget.quickAdd.typeIncome') : t('budget.quickAdd.typeExpense');
  const errorId = 'budget-quick-add-error';
  const describedBy = error ? errorId : undefined;
  const invalid = (field: Field) => error?.field === field || undefined;

  return (
    <li className={cn('flex flex-col gap-1.5 bg-muted/30 px-4 py-2.5 sm:px-5')}>
      <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
        <Button
          type="button"
          size="icon-sm"
          aria-label={typeLabel}
          title={typeLabel}
          className={cn(
            'shrink-0 text-lg font-bold',
            isIncome
              ? 'bg-status-ok-bg text-status-ok hover:bg-status-ok-bg/70'
              : 'bg-status-bad-bg text-status-bad hover:bg-status-bad-bg/70',
          )}
          onClick={() => setType(isIncome ? 'expense' : 'income')}
        >
          <span aria-hidden>{isIncome ? '+' : '−'}</span>
        </Button>
        <div className="flex min-w-0 flex-1 basis-[calc(100%-3rem)] items-center gap-1 sm:basis-auto">
          <Input
            ref={titleRef}
            aria-label={t('budget.quickAdd.label')}
            placeholder={t('budget.quickAdd.placeholder')}
            value={title}
            maxLength={200}
            className="h-9 min-w-0 flex-1 bg-card"
            aria-invalid={invalid('title')}
            aria-describedby={describedBy}
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={onEnter}
          />
          <LabelPopover
            eventId={eventId}
            labels={labels}
            value={labelIds}
            onChange={setLabelIds}
            itemName={t('budget.quickAdd.newItem')}
          />
        </div>
        <AmountInput
          label={t('budget.estimated')}
          value={estimated}
          onChange={setEstimated}
          onKeyDown={onEnter}
          invalid={invalid('estimated')}
          describedBy={describedBy}
        />
        <AmountInput
          label={t('budget.actual')}
          value={actual}
          onChange={setActual}
          onKeyDown={onEnter}
          invalid={invalid('actual')}
          describedBy={describedBy}
        />
        <Button
          type="button"
          size="icon-sm"
          variant="secondary"
          aria-label={t('budget.quickAdd.add')}
          title={t('budget.quickAdd.add')}
          disabled={create.isPending}
          onClick={add}
        >
          <CornerDownLeft aria-hidden />
        </Button>
      </div>
      {!error && (estimated.trim() !== '' || actual.trim() !== '') && (
        <p className="text-xs text-muted-foreground">{t('budget.quickAdd.signHint')}</p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-xs font-semibold text-status-bad">
          {t(error.message)}
        </p>
      )}
    </li>
  );
}

function AmountInput({
  label,
  value,
  onChange,
  onKeyDown,
  invalid,
  describedBy,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  invalid?: boolean;
  describedBy?: string;
}) {
  return (
    <div className="relative w-[calc(50%-1.5rem)] shrink-0 sm:w-31">
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-xs text-muted-foreground"
      >
        €
      </span>
      <Input
        aria-label={label}
        placeholder="0,00"
        inputMode="decimal"
        autoComplete="off"
        value={value}
        className="h-9 bg-card pl-6 text-right tabular-nums"
        aria-invalid={invalid}
        aria-describedby={describedBy}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
      />
    </div>
  );
}
