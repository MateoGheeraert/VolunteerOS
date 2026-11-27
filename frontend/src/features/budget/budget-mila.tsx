'use client';

import { Check, PencilLine, Plus, Sparkles, X } from 'lucide-react';
import { useAction } from 'next-safe-action/hooks';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { AiEventState, Label } from '@/api/generated/types.gen';
import { MILA_NAME, MilaAvatar, MilaBadge, MilaBar, MilaBubble } from '@/components/mila';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useMilaState } from '@/features/ai/mila-suggestions';
import {
  budgetLineAsIsItem,
  budgetLineToForm,
  type AcceptBudgetLineAsIs,
  type BudgetInsightSuggestion,
  type BudgetLineSuggestion,
  type PickableNow,
} from '@/features/ai/schemas';
import { Citations } from '@/features/ai/suggestion-cards';
import { useAiLive } from '@/features/ai/use-ai-live';
import { LabelChip, labelsOf } from '@/features/labels/label-chip';
import type { PickableSupplier } from '@/features/suppliers/supplier-picker';
import { useActionFeedback } from '@/features/tasks/tasks-context';
import { formatCents } from '@/lib/money';
import { cn } from '@/lib/utils';
import {
  acceptBudgetLine,
  acceptBudgetLinesAsIs,
  markSuggestionsSeen,
  rejectSuggestion,
  requestBudgetReview,
} from '@/server/ai/actions';
import { BudgetEntryForm } from './budget-entry-form';

/** Links the save button at the bottom of the modal to the form above it. */
const ACCEPT_FORM_ID = 'budget-mila-accept-form';

/** Marks proposed rows, so "Bekijk voorstellen" (?mila=voorstellen) can scroll to the first. */
const PROPOSAL_ATTRIBUTE = 'data-mila-proposal';

/** What can be picked now: suppliers not archived, and the event's tasks. */
const pickableNow = (suppliers: PickableSupplier[], tasks: { id: string }[]): PickableNow => ({
  supplierIds: new Set(suppliers.filter((s) => !s.archived).map((s) => s.id)),
  taskIds: new Set(tasks.map((task) => task.id)),
});

/** Her proposed lines and insight, from the event's AI state. */
function useBudgetMila(state: AiEventState) {
  const { thinking, failed, suggestions } = useMilaState(
    state,
    ['budget_line', 'budget_insight'],
    'budget_review',
  );
  const lines = suggestions.filter((s): s is BudgetLineSuggestion => s.kind === 'budget_line');
  const insight = suggestions.find(
    (s): s is BudgetInsightSuggestion => s.kind === 'budget_insight',
  );
  return { thinking, failed, lines, insight };
}

/**
 * "Mila, bekijk mijn begroting" on the budget page, in one line above the table: it opens a
 * dialog to tell her what to take into account. Her proposed lines stand in the table itself
 * (`ProposedBudgetRows`); her insight below this line. Managers only, never on an archived event.
 */
export function BudgetMilaBar({
  eventId,
  state,
  entryCount,
  labels,
  tasks,
  suppliers,
}: {
  eventId: string;
  state: AiEventState;
  entryCount: number;
  labels: Label[];
  tasks: { id: string; title: string }[];
  suppliers: PickableSupplier[];
}) {
  const t = useTranslations('ai.budget');
  const tAi = useTranslations('ai');
  useAiLive(eventId, state.enabled);
  const { thinking, failed, lines, insight } = useBudgetMila(state);
  const [asking, setAsking] = useState(false);
  const feedback = useActionFeedback();
  const asIs = lines
    .map((line) => budgetLineAsIsItem(line, labels, pickableNow(suppliers, tasks)))
    .filter((item): item is AcceptBudgetLineAsIs => item !== null);
  const addAll = useAction(acceptBudgetLinesAsIs.bind(null, eventId), {
    ...feedback,
    onSuccess: () => {
      toast.success(t('added'));
      feedback.onSuccess();
    },
  });
  if (!state.enabled) return null;

  const count = lines.length;
  const message = thinking
    ? t('bar.thinking', { name: MILA_NAME })
    : count > 0
      ? t('bar.lines', { name: MILA_NAME, count })
      : entryCount === 0
        ? t('bar.idleEmpty')
        : t('bar.idle');
  const detail =
    !thinking && failed ? tAi('failed') : count > 0 ? t('bar.linesDetail') : t('bar.detail');

  return (
    <>
      <MilaBar
        thinking={thinking}
        message={message}
        detail={detail}
        actions={
          <>
            {asIs.length > 1 && (
              <Button
                size="sm"
                variant="mila"
                disabled={addAll.isPending}
                onClick={() => addAll.execute({ items: asIs })}
              >
                <Plus aria-hidden />
                {t('bar.addAll', { count: asIs.length })}
              </Button>
            )}
            <Button
              size="sm"
              variant={count > 0 ? 'mila-soft' : 'mila'}
              disabled={thinking}
              onClick={() => setAsking(true)}
            >
              <Sparkles aria-hidden />
              {t('review', { name: MILA_NAME })}
            </Button>
          </>
        }
      />
      {insight && !thinking && <BudgetInsightCard eventId={eventId} insight={insight} />}
      <AskBudgetDialog eventId={eventId} open={asking} onOpenChange={setAsking} pending={count} />
    </>
  );
}

/**
 * "Mila, bekijk mijn begroting": what she should take into account ("de zaal krijgen we gratis,
 * we verkopen ook hotdogs"), or nothing, and she reviews from last edition and the checklist.
 */
function AskBudgetDialog({
  eventId,
  open,
  onOpenChange,
  pending,
}: {
  eventId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Lines still open: a new review replaces them. */
  pending: number;
}) {
  const t = useTranslations('ai.budget.ask');
  const feedback = useActionFeedback();
  const [instruction, setInstruction] = useState('');
  const request = useAction(requestBudgetReview.bind(null, eventId), {
    ...feedback,
    onSuccess: () => {
      setInstruction('');
      onOpenChange(false);
      feedback.onSuccess();
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader className="flex-row items-center gap-3">
          <MilaAvatar />
          <div className="flex flex-col gap-1">
            <DialogTitle className="text-mila-ink">{t('title', { name: MILA_NAME })}</DialogTitle>
            <DialogDescription>{t('description')}</DialogDescription>
          </div>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            request.execute({ instruction });
          }}
        >
          <div className="flex flex-col gap-2">
            <label htmlFor="budget-instruction" className="text-sm font-bold">
              {t('label')}
            </label>
            <Textarea
              id="budget-instruction"
              rows={3}
              maxLength={500}
              value={instruction}
              placeholder={t('placeholder')}
              onChange={(e) => setInstruction(e.target.value)}
              disabled={request.isPending}
            />
            <p className="text-xs text-muted-foreground">{t('help')}</p>
          </div>
          {pending > 0 && <p className="text-xs text-muted-foreground">{t('replaces')}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" variant="mila" disabled={request.isPending}>
              <Sparkles aria-hidden />
              {t('submit')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Mila's proposed lines in the budget table itself, above the real ones: dashed and lavender,
 * with her estimate in the estimated column. Add one as proposed, open it in the budget line
 * form first, or say it isn't needed. A line without an amount opens the form.
 */
export function ProposedBudgetRows({
  eventId,
  state,
  labels,
  tasks,
  suppliers,
  scrollToFirst = false,
}: {
  eventId: string;
  state: AiEventState;
  labels: Label[];
  tasks: { id: string; title: string }[];
  suppliers: PickableSupplier[];
  /** The overview's hint links here with `?mila=voorstellen`: scroll to the first proposal. */
  scrollToFirst?: boolean;
}) {
  const t = useTranslations('ai.budget');
  const tCommon = useTranslations('common');
  const { lines } = useBudgetMila(state);
  const [editing, setEditing] = useState<BudgetLineSuggestion | null>(null);
  const [saving, setSaving] = useState(false);

  // Pilot metric "shown": report rows the first time they are on screen.
  const markSeen = useAction(markSuggestionsSeen.bind(null, eventId));
  const unseenKey = lines
    .filter((line) => line.seenAt === null)
    .map((line) => line.id)
    .join(',');
  useEffect(() => {
    if (unseenKey) markSeen.execute({ suggestionIds: unseenKey.split(',') });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per new set of rows
  }, [unseenKey]);
  useEffect(() => {
    if (!scrollToFirst) return;
    document
      .querySelector(`[${PROPOSAL_ATTRIBUTE}]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [scrollToFirst]);

  if (!state.enabled || lines.length === 0) return null;
  return (
    <>
      {lines.map((line) => (
        <ProposedRow
          key={line.id}
          eventId={eventId}
          line={line}
          labels={labels}
          pickable={pickableNow(suppliers, tasks)}
          onEdit={() => setEditing(line)}
        />
      ))}

      <Dialog open={editing !== null} onOpenChange={(isOpen) => !isOpen && setEditing(null)}>
        <DialogContent size="md">
          <DialogHeader>
            <MilaBadge label={t('suggestedBy', { name: MILA_NAME })} className="self-start" />
            <DialogTitle>{t('acceptTitle')}</DialogTitle>
            <DialogDescription>
              {editing ? <EstimateBasis line={editing} /> : t('acceptSubtitle')}
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="flex flex-col gap-6">
              <BudgetEntryForm
                key={editing.id}
                outsideSave={{ formId: ACCEPT_FORM_ID, onPendingChange: setSaving }}
                eventId={eventId}
                action={acceptBudgetLine.bind(null, eventId, editing.id)}
                defaultValues={budgetLineToForm(editing, labels, pickableNow(suppliers, tasks))}
                labels={labels}
                tasks={tasks}
                suppliers={suppliers}
                onDone={() => {
                  toast.success(t('added'));
                  setEditing(null);
                }}
              />
              <div className="flex flex-wrap items-center gap-2 border-t border-border pt-5">
                <Button type="submit" form={ACCEPT_FORM_ID} variant="mila" disabled={saving}>
                  <Plus aria-hidden />
                  {t('add')}
                </Button>
                <Button variant="ghost" className="ml-auto" onClick={() => setEditing(null)}>
                  {tCommon('cancel')}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** One proposed line as a table row: what, her estimate (and where it comes from), and why. */
function ProposedRow({
  eventId,
  line,
  labels,
  pickable,
  onEdit,
}: {
  eventId: string;
  line: BudgetLineSuggestion;
  labels: Label[];
  pickable: PickableNow;
  onEdit: () => void;
}) {
  const t = useTranslations('ai.budget');
  const tAi = useTranslations('ai');
  const feedback = useActionFeedback();
  const asIs = budgetLineAsIsItem(line, labels, pickable);
  const add = useAction(acceptBudgetLinesAsIs.bind(null, eventId), {
    ...feedback,
    onSuccess: () => {
      toast.success(t('added'));
      feedback.onSuccess();
    },
  });
  const reject = useAction(rejectSuggestion.bind(null, eventId, line.id), feedback);
  const busy = add.isPending || reject.isPending;
  const { payload } = line;
  const isIncome = payload.type === 'income';
  const lineLabels = labelsOf(labels, payload.labelIds);

  return (
    <li
      {...{ [PROPOSAL_ATTRIBUTE]: '' }}
      className="mx-2 my-1.5 flex flex-col gap-2 rounded-xl border-2 border-dashed border-mila-tint-strong bg-mila-tint/40 px-3 py-2.5 sm:px-4"
    >
      <div className="flex min-w-0 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="font-bold text-mila-ink">
            <span className="sr-only">{isIncome ? t('income') : t('expense')}: </span>
            {payload.title}
          </span>
          <span className="flex flex-wrap items-center gap-1.5 text-xs">
            <MilaBadge label={t('suggestedBy', { name: MILA_NAME })} />
            <Badge variant="secondary">{t(`origin.${payload.origin}`)}</Badge>
            {payload.task && (
              <Badge variant="outline">{t('forTask', { title: payload.task.title })}</Badge>
            )}
            {payload.supplier && (
              <Badge variant="outline">{t('supplier', { name: payload.supplier.name })}</Badge>
            )}
            {lineLabels.map((label) => (
              <LabelChip key={label.id} label={label} />
            ))}
          </span>
        </div>
        <div className="grid shrink-0 grid-cols-2 gap-x-2 text-right text-sm tabular-nums sm:w-[15.75rem]">
          <span
            className={cn(
              'font-bold',
              payload.estimate ? (isIncome ? 'text-status-ok' : 'text-status-bad') : '',
            )}
          >
            {payload.estimate ? (
              <>
                <span className="sr-only">{t('estimate')}: </span>
                {isIncome ? '+ ' : '− '}
                {formatCents(payload.estimate.cents)}
              </>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </span>
          <span className="text-muted-foreground">—</span>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        <EstimateBasis line={line} />
      </p>
      <p className="text-sm text-mila-ink">{line.explanation}</p>
      <Citations citations={line.citations} />
      <div className="flex flex-wrap gap-1.5">
        <Button
          size="sm"
          variant="mila"
          disabled={busy}
          onClick={() => (asIs ? add.execute({ items: [asIs] }) : onEdit())}
        >
          <Check aria-hidden />
          {t('accept')}
        </Button>
        <Button size="sm" variant="mila-soft" disabled={busy} onClick={onEdit}>
          <PencilLine aria-hidden />
          {t('editAndAdd')}
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => reject.execute()}>
          <X aria-hidden />
          {tAi('notNeeded')}
        </Button>
      </div>
    </li>
  );
}

/**
 * Where the estimate comes from, so it can be checked: last year's amount (and how it scaled to
 * this year's visitors), or the richtprijs to ask a quote for. Never an actual amount.
 */
function EstimateBasis({ line }: { line: BudgetLineSuggestion }) {
  const t = useTranslations('ai.budget');
  const { estimate } = line.payload;
  if (!estimate) return <>{t('noAmount')}</>;
  if (estimate.basis === 'richtprijs') {
    return (
      <>
        {t('richtprijs', {
          min: formatCents(estimate.minCents),
          max: formatCents(estimate.maxCents),
        })}
      </>
    );
  }
  const { source } = estimate;
  if (estimate.scaled && source.attendance !== null && estimate.targetAttendance !== null) {
    return (
      <>
        {t('fromPreviousScaled', {
          event: source.eventName,
          amount: formatCents(source.actualCents),
          attendance: source.attendance,
          estimate: formatCents(estimate.cents),
          target: estimate.targetAttendance,
        })}
      </>
    );
  }
  return (
    <>{t('fromPrevious', { event: source.eventName, amount: formatCents(source.actualCents) })}</>
  );
}

/** "−€ 420,00" / "+€ 1.660,00": the sign says which way it goes. */
const signed = (cents: number) => `${cents < 0 ? '−' : '+'}${formatCents(Math.abs(cents))}`;

/**
 * What the budget's numbers mean: Mila's words on top, the figures the app computed below
 * (result, fixed and variable parts, per visitor last time, fewer or more visitors). Nothing to
 * accept; each review replaces it, and it can be put away until then.
 */
function BudgetInsightCard({
  eventId,
  insight,
}: {
  eventId: string;
  insight: BudgetInsightSuggestion;
}) {
  const t = useTranslations('ai.budget.insight');
  const feedback = useActionFeedback();
  const hide = useAction(rejectSuggestion.bind(null, eventId, insight.id), feedback);
  const figures = insight.payload;
  const previousName = figures.previousEdition?.name ?? '';

  return (
    <MilaBubble message={insight.title} detail={insight.explanation}>
      {figures.basis === 'none' ? null : (
        <div className="flex flex-col gap-3 text-sm">
          {figures.basis === 'previous_edition' && (
            <p className="text-xs text-muted-foreground">
              {t('basisPrevious', { event: previousName, target: figures.expectedAttendance ?? 0 })}
            </p>
          )}
          <dl className="grid gap-1">
            <div className="flex justify-between gap-3">
              <dt className="font-bold text-muted-foreground">{t('result')}</dt>
              <dd
                className={cn(
                  'font-bold tabular-nums',
                  figures.resultCents < 0 ? 'text-status-bad' : 'text-status-ok',
                )}
              >
                {signed(figures.resultCents)}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{t('income')}</dt>
              <dd className="text-right tabular-nums">
                {formatCents(figures.incomeCents)}
                <span className="block text-xs text-muted-foreground">
                  {t('split', {
                    fixed: formatCents(figures.split.fixedIncomeCents),
                    variable: formatCents(figures.split.variableIncomeCents),
                  })}
                </span>
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{t('expenses')}</dt>
              <dd className="text-right tabular-nums">
                {formatCents(figures.expenseCents)}
                <span className="block text-xs text-muted-foreground">
                  {t('split', {
                    fixed: formatCents(figures.split.fixedExpenseCents),
                    variable: formatCents(figures.split.variableExpenseCents),
                  })}
                </span>
              </dd>
            </div>
          </dl>

          {figures.perVisitor && (
            <div className="flex flex-col gap-1">
              <p className="font-bold text-mila-ink">
                {t('perVisitorTitle', { event: previousName })}
              </p>
              <p className="tabular-nums">
                {t('perVisitor', {
                  income: formatCents(figures.perVisitor.incomeCents),
                  expenses: formatCents(figures.perVisitor.expenseCents),
                })}
              </p>
              {figures.perVisitor.lines.length > 0 && (
                <ul className="text-xs text-muted-foreground">
                  {figures.perVisitor.lines.map((line) => (
                    <li key={`${line.type}-${line.title}`} className="tabular-nums">
                      {t('perVisitorLine', { title: line.title, amount: formatCents(line.cents) })}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {figures.scenarios.length > 0 && (
            <div className="flex flex-col gap-1">
              <p className="font-bold text-mila-ink">{t('scenariosTitle')}</p>
              <ul className="flex flex-col gap-0.5">
                {figures.scenarios.map((scenario) => (
                  <li key={scenario.changePercent} className="tabular-nums">
                    {t('scenario', {
                      attendance: scenario.attendance,
                      change: `${scenario.changePercent > 0 ? '+' : '−'}${Math.abs(scenario.changePercent)}`,
                      result: signed(scenario.resultCents),
                      difference: signed(scenario.differenceCents),
                    })}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      <Button
        size="sm"
        variant="ghost"
        className="self-start text-mila-ink/75 hover:text-mila-ink"
        disabled={hide.isPending}
        onClick={() => hide.execute()}
      >
        <X aria-hidden />
        {t('hide')}
      </Button>
    </MilaBubble>
  );
}
