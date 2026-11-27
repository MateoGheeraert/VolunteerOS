'use client';

import { CalendarRange, Check, Flag, Plus, Sparkles, Users } from 'lucide-react';
import { useAction } from 'next-safe-action/hooks';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { PromotionState } from '@/api/generated/types.gen';
import { IconBlob } from '@/components/layout/icon-blob';
import { MILA_NAME, MilaAvatar, MilaBadge, MilaBar } from '@/components/mila';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useAiLive } from '@/features/ai/use-ai-live';
import { EMPTY_TASK } from '@/features/tasks/schemas';
import { TaskStatusBadge } from '@/features/tasks/task-badges';
import { isOverdue } from '@/features/tasks/task-rules';
import { TaskForm } from '@/features/tasks/task-form';
import { useActionFeedback, useTasksContext } from '@/features/tasks/tasks-context';
import { formatDay } from '@/lib/format';
import { formatCents } from '@/lib/money';
import { cn } from '@/lib/utils';
import { markSuggestionsSeen } from '@/server/ai/actions';
import {
  acceptPromoAction,
  acceptPromoActionsAsIs,
  createPromotionTask,
  requestPromotionPlan,
} from '@/server/promotion/actions';
import { PromoActionCard } from './promo-action-card';
import {
  asIsPromoItem,
  buildTimeline,
  isPromotionLabel,
  promoActionToTaskForm,
  type PromoAction,
  type PromotionTask,
  type TimelineGroup,
} from './schemas';

/**
 * The Promotie tab's main part: Mila in one line on top (her plan opens in a dialog), then the
 * timeline in weeks before the event, where what is planned (Promotie tasks, Mila's or the
 * organizer's own) and what Mila only proposes look different. Managers decide on her actions
 * and add their own (inside a TasksProvider: both open the task dialog); others see the tasks.
 */
export function PromotionBoard({
  eventId,
  state,
  eventStartDate,
  today,
}: {
  eventId: string;
  state: PromotionState;
  /** Brussels calendar days. */
  eventStartDate: string;
  today: string;
}) {
  const mila = state.mila;
  useAiLive(eventId, mila?.enabled ?? false);
  // A plan made days ago may hold due dates that have passed since: they are due today now, on
  // the timeline and when accepted, instead of becoming overdue tasks straight away.
  const actions = (mila?.suggestions ?? [])
    .filter((s): s is PromoAction => s.kind === 'promo_action')
    .map((action) =>
      action.payload.dueDate < today
        ? { ...action, payload: { ...action.payload, dueDate: today } }
        : action,
    );
  const hasPlan = state.metric.suggested > 0 || actions.length > 0;
  const groups = buildTimeline({ actions, tasks: state.tasks, eventStartDate, today });

  return (
    <div className="flex flex-col gap-5">
      {mila?.enabled && (
        <PromotionMilaBar
          eventId={eventId}
          state={state}
          pending={actions.length}
          hasPlan={hasPlan}
        />
      )}
      {mila ? (
        <ManagedTimeline
          eventId={eventId}
          state={state}
          groups={groups}
          actions={actions}
          eventStartDate={eventStartDate}
          today={today}
        />
      ) : (
        <Timeline
          state={state}
          eventId={eventId}
          groups={groups}
          eventStartDate={eventStartDate}
          today={today}
        />
      )}
    </div>
  );
}

// ── Mila ──────────────────────────────────────────────────────────────────────────────────────

/** Mila in one line: what she is doing, and a button that opens her plan dialog. */
function PromotionMilaBar({
  eventId,
  state,
  pending,
  hasPlan,
}: {
  eventId: string;
  state: PromotionState;
  pending: number;
  /** She made a plan before: the button asks for a new one. */
  hasPlan: boolean;
}) {
  const t = useTranslations('promotion');
  const [open, setOpen] = useState(false);
  const mila = state.mila!;
  const { guard } = state;
  const running = mila.run?.status === 'queued' || mila.run?.status === 'running';
  const failed = !running && mila.run?.status === 'failed';

  const message =
    guard.state === 'disabled'
      ? t('bar.disabled')
      : running
        ? t('bar.thinking', { name: MILA_NAME })
        : guard.state === 'blocked'
          ? t('bar.blocked')
          : pending > 0
            ? t('bar.suggestions', { name: MILA_NAME, count: pending })
            : hasPlan
              ? t('bar.planned')
              : t('bar.idle');
  const detail = failed
    ? t('plan.failed')
    : guard.state === 'blocked'
      ? t('bar.blockedDetail')
      : pending > 0
        ? t('bar.suggestionsDetail')
        : guard.state === 'ready'
          ? t('plan.subtitle')
          : undefined;

  return (
    <>
      <MilaBar
        thinking={running}
        message={message}
        detail={detail}
        actions={
          guard.state === 'blocked' ? (
            <Button size="sm" variant="mila" asChild>
              <Link href="?publiek=open" scroll={false}>
                <Users aria-hidden />
                {t('audience.fill')}
              </Link>
            </Button>
          ) : guard.state === 'ready' ? (
            <Button size="sm" variant="mila" disabled={running} onClick={() => setOpen(true)}>
              <Sparkles aria-hidden />
              {hasPlan ? t('bar.remake') : t('bar.help')}
            </Button>
          ) : null
        }
      />
      {guard.state === 'ready' && (
        <PlanDialog
          eventId={eventId}
          state={state}
          pending={pending}
          hasPlan={hasPlan}
          open={open}
          onOpenChange={setOpen}
        />
      )}
    </>
  );
}

/** Asking Mila for a plan: her warnings, the budget she works with, and an optional steer. */
function PlanDialog({
  eventId,
  state,
  pending,
  hasPlan,
  open,
  onOpenChange,
}: {
  eventId: string;
  state: PromotionState;
  pending: number;
  hasPlan: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('promotion');
  const feedback = useActionFeedback();
  const [instruction, setInstruction] = useState('');
  const request = useAction(requestPromotionPlan.bind(null, eventId), {
    ...feedback,
    onSuccess: () => {
      setInstruction('');
      onOpenChange(false);
      feedback.onSuccess();
    },
  });
  const { guard, budget } = state;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader className="flex-row items-center gap-3">
          <MilaAvatar />
          <div className="flex flex-col gap-1">
            <DialogTitle className="text-mila-ink">
              {t('dialog.title', { name: MILA_NAME })}
            </DialogTitle>
            <DialogDescription>{t('dialog.description')}</DialogDescription>
          </div>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            request.execute({ instruction });
          }}
        >
          {guard.state === 'ready' && guard.missing.length > 0 && (
            <p className="rounded-xl bg-status-warn-bg px-3 py-2 text-sm font-semibold text-status-warn">
              {t('plan.missing', {
                fields: guard.missing.map((field) => t(`plan.missingField.${field}`)).join(', '),
              })}{' '}
              <Link href="?publiek=open" scroll={false} className="underline underline-offset-4">
                {t('plan.missingLink')}
              </Link>
            </p>
          )}
          {guard.state === 'ready' && guard.lastMinute && (
            <p className="rounded-xl bg-status-warn-bg px-3 py-2 text-sm font-semibold text-status-warn">
              {t('plan.lastMinute', { days: guard.daysLeft })}
            </p>
          )}
          <p className="rounded-xl bg-mila-tint px-3 py-2 text-sm text-mila-ink">
            {budget.budgetCents === null
              ? t('plan.noBudget')
              : t('plan.budgetLine', {
                  available: formatCents(budget.availableCents ?? 0),
                  budget: formatCents(budget.budgetCents),
                })}
          </p>
          <div className="flex flex-col gap-2">
            <label htmlFor="plan-instruction" className="text-sm font-bold">
              {t('plan.instruction')}
            </label>
            <Textarea
              id="plan-instruction"
              rows={3}
              maxLength={500}
              value={instruction}
              placeholder={t('plan.instructionPlaceholder')}
              onChange={(event) => setInstruction(event.target.value)}
              disabled={request.isPending}
            />
          </div>
          {pending > 0 && <p className="text-xs text-muted-foreground">{t('plan.replaces')}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t('dialog.cancel')}
            </Button>
            <Button type="submit" variant="mila" disabled={request.isPending}>
              <Sparkles aria-hidden />
              {hasPlan ? t('plan.remake') : t('plan.make')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Timeline ──────────────────────────────────────────────────────────────────────────────────

/** The timeline with Mila's actions to decide on, and the organizer's own actions to add. */
function ManagedTimeline({
  eventId,
  state,
  groups,
  actions,
  eventStartDate,
  today,
}: {
  eventId: string;
  state: PromotionState;
  groups: TimelineGroup[];
  actions: PromoAction[];
  eventStartDate: string;
  today: string;
}) {
  const t = useTranslations('promotion');
  const { readOnly, event, labels } = useTasksContext();
  const feedback = useActionFeedback();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectedWithBudget, setSelectedWithBudget] = useState(true);
  const [editing, setEditing] = useState<PromoAction | null>(null);
  const [editingWithBudget, setEditingWithBudget] = useState(true);
  const [addingOwn, setAddingOwn] = useState(false);
  const chosen = actions.filter((action) => selected.has(action.id));

  const acceptSelected = useAction(acceptPromoActionsAsIs.bind(null, eventId), {
    ...feedback,
    onSuccess: () => {
      setSelected(new Set());
      feedback.onSuccess();
    },
  });
  // Rebound when the checkbox changes: the dialog's form submits the action as it is then.
  const acceptOne = useMemo(
    () =>
      editing
        ? acceptPromoAction.bind(
            null,
            eventId,
            editing.id,
            editingWithBudget && editing.payload.estimatedCostCents > 0,
          )
        : null,
    [eventId, editing, editingWithBudget],
  );
  const disabled = readOnly || acceptSelected.isPending;

  // Pilot metric "shown": report cards the first time they are on screen.
  const markSeen = useAction(markSuggestionsSeen.bind(null, eventId));
  const unseenKey = actions
    .filter((action) => action.seenAt === null)
    .map((action) => action.id)
    .join(',');
  useEffect(() => {
    if (unseenKey) markSeen.execute({ suggestionIds: unseenKey.split(',') });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per new set of cards
  }, [unseenKey]);

  const cost = chosen.reduce((sum, action) => sum + action.payload.estimatedCostCents, 0);
  const promotionLabel = labels.find(isPromotionLabel);

  return (
    <>
      <Timeline
        state={state}
        eventId={eventId}
        groups={groups}
        eventStartDate={eventStartDate}
        today={today}
        headerAction={
          !readOnly && (
            <Button size="sm" variant="secondary" onClick={() => setAddingOwn(true)}>
              <Plus aria-hidden />
              {t('own.add')}
            </Button>
          )
        }
        renderAction={(action, marker) => (
          <PromoActionCard
            key={action.id}
            eventId={eventId}
            action={action}
            marker={marker}
            disabled={disabled}
            selected={selected.has(action.id)}
            onSelectedChange={(isSelected) =>
              setSelected((current) => {
                const next = new Set(current);
                if (isSelected) next.add(action.id);
                else next.delete(action.id);
                return next;
              })
            }
            onEdit={() => {
              setEditingWithBudget(true);
              setEditing(action);
            }}
          />
        )}
      />

      {actions.length > 0 && !readOnly && (
        <div className="sticky bottom-4 z-10 flex flex-wrap items-center gap-3 self-start rounded-card bg-card px-4 py-3 shadow-soft">
          <Button
            variant="mila"
            disabled={chosen.length === 0 || disabled}
            onClick={() =>
              acceptSelected.execute({
                items: chosen.map((action) => asIsPromoItem(action, selectedWithBudget)),
              })
            }
          >
            <Plus aria-hidden />
            {t('plan.addSelected', { count: chosen.length })}
          </Button>
          <label className="flex items-center gap-2 text-sm font-bold">
            <input
              type="checkbox"
              className="size-4 accent-mila"
              checked={selectedWithBudget}
              onChange={(event) => setSelectedWithBudget(event.target.checked)}
            />
            {t('plan.withBudgetLines')}
            {cost > 0 && <span className="text-muted-foreground">({formatCents(cost)})</span>}
          </label>
        </div>
      )}

      <Dialog open={editing !== null} onOpenChange={(isOpen) => !isOpen && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <MilaBadge label={t('timeline.suggestion')} className="self-start" />
            <DialogTitle>{t('plan.acceptTitle')}</DialogTitle>
            <DialogDescription>{t('plan.acceptSubtitle')}</DialogDescription>
          </DialogHeader>
          {editing && event && acceptOne && (
            <TaskForm
              key={editing.id}
              event={event}
              action={acceptOne}
              defaultValues={promoActionToTaskForm(editing, labels)}
              submitLabel={t('plan.addTask')}
              onDone={() => setEditing(null)}
              onCancel={() => setEditing(null)}
              extra={
                editing.payload.estimatedCostCents > 0 && (
                  <label className="flex items-center gap-2 text-sm font-bold">
                    <input
                      type="checkbox"
                      className="size-4 accent-mila"
                      checked={editingWithBudget}
                      onChange={(change) => setEditingWithBudget(change.target.checked)}
                    />
                    {t('plan.withBudgetLine', {
                      amount: formatCents(editing.payload.estimatedCostCents),
                    })}
                  </label>
                )
              }
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={addingOwn} onOpenChange={setAddingOwn}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('own.title')}</DialogTitle>
            <DialogDescription>{t('own.description')}</DialogDescription>
          </DialogHeader>
          {addingOwn && event && (
            <TaskForm
              event={event}
              action={createPromotionTask.bind(null, eventId)}
              defaultValues={{
                ...EMPTY_TASK,
                labelIds: promotionLabel ? [promotionLabel.id] : [],
              }}
              submitLabel={t('own.save')}
              onDone={() => setAddingOwn(false)}
              onCancel={() => setAddingOwn(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

type Marker = 'planned' | 'done' | 'overdue' | 'suggestion';

/** A dot on the timeline's line. The ring hides the line behind it. */
function Dot({ kind }: { kind: Marker }) {
  if (kind === 'done') {
    return (
      <span className="grid size-5 place-items-center rounded-full bg-status-ok text-white ring-4 ring-card">
        <Check className="size-3" strokeWidth={3} aria-hidden />
      </span>
    );
  }
  return (
    <span
      className={cn(
        'size-3.5 rounded-full ring-4 ring-card',
        kind === 'planned' && 'bg-primary',
        kind === 'overdue' && 'bg-status-bad',
        kind === 'suggestion' && 'border-2 border-dashed border-mila bg-card',
      )}
    />
  );
}

/** Positions a dot on the line, from inside an item that is indented past it. */
function ItemMarker({ kind }: { kind: Marker }) {
  return (
    <span aria-hidden className="absolute top-4 -left-9 grid w-6 place-items-center">
      <Dot kind={kind} />
    </span>
  );
}

/**
 * Weeks before the event as a line with dots, from far ahead to the event itself: tasks are solid
 * dots (green when done, red when late), Mila's proposals dashed. Tasks without a date come last.
 */
function Timeline({
  state,
  eventId,
  groups,
  eventStartDate,
  today,
  headerAction,
  renderAction,
}: {
  state: PromotionState;
  eventId: string;
  groups: TimelineGroup[];
  eventStartDate: string;
  today: string;
  headerAction?: ReactNode;
  renderAction?: (action: PromoAction, marker: ReactNode) => ReactNode;
}) {
  const t = useTranslations('promotion');
  const dated = groups.filter((group) => group.type !== 'none');
  const undated = groups.find((group) => group.type === 'none');

  const renderGroup = (group: TimelineGroup) => (
    <li key={group.key} className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span aria-hidden className="grid w-6 place-items-center">
          <span
            className={cn(
              'size-2.5 rounded-full ring-4 ring-card',
              group.type === 'overdue' ? 'bg-status-bad' : 'bg-muted-foreground/40',
            )}
          />
        </span>
        <h3
          className={cn(
            'text-sm font-bold',
            group.type === 'overdue' ? 'text-status-bad' : 'text-muted-foreground',
          )}
        >
          {group.type === 'overdue'
            ? t('timeline.overdue')
            : group.type === 'none'
              ? t('timeline.noDate')
              : t('timeline.week', { weeks: group.weeks })}
        </h3>
      </div>
      <ul className="flex flex-col gap-3 pl-9">
        {group.items.map((item) => {
          if (item.kind === 'action') {
            return renderAction?.(item.action, <ItemMarker kind="suggestion" />);
          }
          const { task } = item;
          const overdue = isOverdue(task, today);
          return (
            <TaskRow
              key={task.id}
              eventId={eventId}
              task={task}
              overdue={overdue}
              marker={
                <ItemMarker
                  kind={task.status === 'done' ? 'done' : overdue ? 'overdue' : 'planned'}
                />
              }
            />
          );
        })}
      </ul>
    </li>
  );

  return (
    <section className="flex flex-col gap-5 rounded-card bg-card p-5 shadow-soft sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <IconBlob icon={CalendarRange} tone="brand" className="size-9 [&>svg]:size-4" />
          <div className="flex flex-col">
            <h2 className="text-lg">{t('timeline.title')}</h2>
            <p className="text-sm text-muted-foreground">{t('timeline.subtitle')}</p>
          </div>
        </div>
        {headerAction}
      </header>

      <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2 text-xs font-bold text-muted-foreground">
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {(['planned', 'done', 'overdue', 'suggestion'] as const).map((kind) => (
            <li key={kind} className="flex items-center gap-2">
              <span className="grid w-5 place-items-center">
                <Dot kind={kind} />
              </span>
              {t(`timeline.legend.${kind}`)}
            </li>
          ))}
        </ul>
        <span>{t('metric', state.metric)}</span>
      </div>

      {groups.length === 0 && (
        <p className="text-sm text-muted-foreground">{t('timeline.empty')}</p>
      )}

      <div className="relative">
        <span
          aria-hidden
          className="absolute top-3 bottom-3 left-[11px] w-0.5 rounded-full bg-muted-foreground/30"
        />
        <ol className="relative flex flex-col gap-6">
          {dated.map(renderGroup)}
          <li className="flex items-center gap-3">
            <span className="grid size-6 place-items-center rounded-full bg-primary text-primary-foreground ring-4 ring-card">
              <Flag className="size-3.5" aria-hidden />
            </span>
            <p className="text-sm font-bold">
              {t('timeline.eventNode')}{' '}
              <span className="font-normal text-muted-foreground">
                · {formatDay(eventStartDate)}
              </span>
            </p>
          </li>
          {undated && renderGroup(undated)}
        </ol>
      </div>
    </section>
  );
}

function TaskRow({
  eventId,
  task,
  overdue,
  marker,
}: {
  eventId: string;
  task: PromotionTask;
  overdue: boolean;
  marker: ReactNode;
}) {
  const t = useTranslations('promotion.timeline');
  const done = task.status === 'done';
  return (
    <li className="relative flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl bg-background px-4 py-3">
      {marker}
      <TaskStatusBadge status={task.status} overdue={overdue} />
      <Link
        href={`/events/${eventId}/tasks`}
        className={cn(
          'min-w-0 flex-1 font-bold underline-offset-4 hover:underline',
          done && 'text-muted-foreground',
        )}
      >
        {task.title}
      </Link>
      {task.fromMila && <MilaBadge label={t('fromMila')} />}
      <span className="text-sm text-muted-foreground">
        {[task.assigneeName, task.dueDate && formatDay(task.dueDate)].filter(Boolean).join(' · ')}
      </span>
    </li>
  );
}
