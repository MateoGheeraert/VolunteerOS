'use client';

import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  MoreHorizontal,
  Paperclip,
  Tags,
  Trash2,
} from 'lucide-react';
import { useAction } from 'next-safe-action/hooks';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import type { BudgetEntry, Label } from '@/api/generated/types.gen';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { NativeSelect } from '@/components/ui/native-select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { LabelChip, labelsOf } from '@/features/labels/label-chip';
import { LabelManager } from '@/features/labels/label-manager';
import { LabelPopover } from '@/features/labels/label-popover';
import { AttachedFiles } from '@/features/uploads/attached-files';
import { formatCents } from '@/lib/money';
import { cn } from '@/lib/utils';
import {
  deleteBudgetEntry,
  setBudgetEntryLabels,
  updateBudgetEntry,
} from '@/server/budget/actions';
import {
  budgetTotals,
  filterEntries,
  DEFAULT_BUDGET_SORT,
  isFiltered,
  nextSort,
  NO_BUDGET_FILTERS,
  sortEntries,
  type BudgetFilters,
  type BudgetSort,
  type BudgetSortKey,
} from './budget-totals';
import { BudgetEntryForm } from './budget-entry-form';
import { BudgetQuickAdd } from './budget-quick-add';
import { budgetEntryToForm, type BudgetEntryType } from './schemas';

/**
 * An event's budget: the totals, then one list of income (green, +) and costs (red, −), newest
 * first. Managers type new lines into the row on top (Enter adds one), tag lines in place, and
 * open a line in a side sheet for its task, notes and files; everyone else reads. The backend decides what is
 * allowed; `canManage` only decides which controls show.
 */
export function BudgetView({
  eventId,
  entries,
  labels,
  tasks,
  canManage,
  readOnly,
}: {
  eventId: string;
  entries: BudgetEntry[];
  labels: Label[];
  /** The event's tasks, to link an entry to (managers only). */
  tasks: { id: string; title: string }[];
  canManage: boolean;
  /** Archived events: everything is shown, nothing can change. */
  readOnly: boolean;
}) {
  const t = useTranslations();
  const [filters, setFilters] = useState<BudgetFilters>(NO_BUDGET_FILTERS);
  const [openId, setOpenId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<BudgetEntry | null>(null);
  const [labelsOpen, setLabelsOpen] = useState(false);
  const mayEdit = canManage && !readOnly;

  const [sort, setSort] = useState<BudgetSort>(DEFAULT_BUDGET_SORT);
  // A label deleted meanwhile no longer filters (its option is gone from the select too).
  const activeFilters: BudgetFilters = labels.some((label) => label.id === filters.labelId)
    ? filters
    : { ...filters, labelId: 'all' };
  const shown = sortEntries(filterEntries(entries, activeFilters), sort);
  const sortBy = (key: Exclude<BudgetSortKey, 'created'>) =>
    setSort((current) => nextSort(current, key));
  // The pane reads the entry from fresh page data, so it updates after every change.
  const openEntry = openId ? entries.find((entry) => entry.id === openId) : undefined;

  return (
    <div className="flex flex-col gap-4">
      <Summary entries={shown} filtered={isFiltered(activeFilters)} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <div className="w-44">
            <NativeSelect
              aria-label={t('budget.type')}
              value={filters.type}
              className="h-9 bg-card"
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  type: event.target.value as BudgetFilters['type'],
                }))
              }
            >
              <option value="all">{t('budget.allTypes')}</option>
              <option value="income">{t('budget.income')}</option>
              <option value="expense">{t('budget.expenses')}</option>
            </NativeSelect>
          </div>
          {labels.length > 0 && (
            <div className="w-44">
              <NativeSelect
                aria-label={t('budget.labels')}
                value={activeFilters.labelId}
                className="h-9 bg-card"
                onChange={(event) =>
                  setFilters((current) => ({ ...current, labelId: event.target.value }))
                }
              >
                <option value="all">{t('budget.allLabels')}</option>
                {labels.map((label) => (
                  <option key={label.id} value={label.id}>
                    {label.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
          )}
        </div>
        {mayEdit && (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => setLabelsOpen(true)}>
              <Tags data-icon="inline-start" aria-hidden />
              {t('labels.manage')}
            </Button>
          </div>
        )}
      </div>

      <section aria-label={t('budget.title')} className="overflow-hidden rounded-3xl bg-card">
        <div className="flex items-center gap-2 border-b border-border px-4 py-1.5 text-xs font-bold text-muted-foreground sm:px-5">
          <SortButton
            label={t('budget.columnDescription')}
            active={sort.key === 'title' ? sort.direction : null}
            onClick={() => sortBy('title')}
            className="flex-1 justify-start"
          />
          <SortButton
            label={t('budget.estimated')}
            active={sort.key === 'estimated' ? sort.direction : null}
            onClick={() => sortBy('estimated')}
            className="w-24 justify-end sm:w-31"
          />
          <SortButton
            label={t('budget.actual')}
            active={sort.key === 'actual' ? sort.direction : null}
            onClick={() => sortBy('actual')}
            className="w-24 justify-end sm:w-31"
          />
          {mayEdit && <span aria-hidden className="w-8 shrink-0" />}
        </div>
        <ul className="flex flex-col divide-y divide-border">
          {mayEdit && <BudgetQuickAdd eventId={eventId} labels={labels} />}
          {shown.map((entry) => (
            <EntryRow
              key={`${entry.id}-${entry.updatedAt}`}
              eventId={eventId}
              entry={entry}
              labels={labels}
              mayEdit={mayEdit}
              onOpen={() => setOpenId(entry.id)}
              onDelete={() => setDeleting(entry)}
            />
          ))}
          {shown.length === 0 && (
            <li className="px-5 py-8 text-center text-sm text-muted-foreground">
              {entries.length === 0 ? t('budget.empty') : t('budget.emptyFiltered')}
            </li>
          )}
        </ul>
      </section>

      <Sheet open={openId !== null} onOpenChange={(isOpen) => !isOpen && setOpenId(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="text-lg">{openEntry?.title ?? t('budget.editTitle')}</SheetTitle>
            <SheetDescription>
              {openEntry ? t('budget.editDescription') : t('budget.gone')}
            </SheetDescription>
          </SheetHeader>
          {openEntry && (
            <div className="flex flex-col gap-6 px-4 pb-6">
              {mayEdit ? (
                <BudgetEntryForm
                  // Fresh form values after each save.
                  key={`${openEntry.id}-${openEntry.updatedAt}`}
                  eventId={eventId}
                  action={updateBudgetEntry.bind(null, eventId, openEntry.id)}
                  defaultValues={budgetEntryToForm(openEntry)}
                  labels={labels}
                  tasks={withLinkedTask(tasks, openEntry)}
                  submitLabel={t('common.save')}
                  onDone={() => toast.success(t('budget.saved'))}
                />
              ) : (
                <EntryDetails entry={openEntry} labels={labels} />
              )}
              <AttachedFiles
                key={openEntry.id}
                eventId={eventId}
                owner={{ budgetEntryId: openEntry.id }}
                canAdd={mayEdit}
                readOnly={readOnly}
              />
              {mayEdit && (
                <Button
                  variant="ghost"
                  className="w-fit text-destructive"
                  onClick={() => setDeleting(openEntry)}
                >
                  <Trash2 data-icon="inline-start" aria-hidden />
                  {t('budget.delete')}
                </Button>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {deleting && (
        <DeleteEntryDialog
          eventId={eventId}
          entry={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            if (openId === deleting.id) setOpenId(null);
            setDeleting(null);
          }}
        />
      )}

      {mayEdit && (
        <LabelManager
          eventId={eventId}
          labels={labels}
          open={labelsOpen}
          onOpenChange={setLabelsOpen}
        />
      )}
    </div>
  );
}

/** The estimated and actual amount side by side, signed and colored by type. */
function AmountColumns({
  type,
  estimated,
  actual,
  className,
}: {
  type: BudgetEntryType;
  estimated: number | null;
  actual: number | null;
  className?: string;
}) {
  const t = useTranslations();
  return (
    <span
      className={cn(
        'grid shrink-0 grid-cols-2 gap-x-2 text-right text-sm tabular-nums sm:w-[15.75rem]',
        className,
      )}
    >
      <span className="flex flex-col">
        <span className="text-xs font-normal text-muted-foreground sm:hidden">
          {t('budget.estimated')}
        </span>
        <SignedAmount type={type} cents={estimated} muted />
      </span>
      <span className="flex flex-col">
        <span className="text-xs font-normal text-muted-foreground sm:hidden">
          {t('budget.actual')}
        </span>
        <SignedAmount type={type} cents={actual} />
      </span>
    </span>
  );
}

/** "+ € 1.250,50" in green for income, "− € 2.800,00" in red for an expense. */
function SignedAmount({
  type,
  cents,
  muted = false,
}: {
  type: BudgetEntryType;
  cents: number | null;
  muted?: boolean;
}) {
  const t = useTranslations();
  if (cents === null) return <span className="text-muted-foreground">{t('budget.noAmount')}</span>;
  const isIncome = type === 'income';
  return (
    <span
      className={cn(
        'whitespace-nowrap',
        isIncome ? 'text-status-ok' : 'text-status-bad',
        muted && 'opacity-75',
      )}
    >
      <span className="sr-only">{isIncome ? t('budget.income') : t('budget.expenses')}: </span>
      {isIncome ? '+ ' : '− '}
      {formatCents(cents)}
    </span>
  );
}

/** A column title that sorts the list; it shows the direction while it is the active sort. */
function SortButton({
  label,
  active,
  onClick,
  className,
}: {
  label: string;
  active: 'asc' | 'desc' | null;
  onClick: () => void;
  className?: string;
}) {
  const t = useTranslations();
  const Icon = active === 'asc' ? ArrowUp : active === 'desc' ? ArrowDown : ArrowUpDown;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t('budget.sortBy', { column: label })}
      aria-pressed={active !== null}
      className={cn(
        'flex min-w-0 items-center gap-1 rounded-md px-1 py-1 outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50',
        active && 'text-foreground',
        className,
      )}
    >
      <span className="truncate">{label}</span>
      <Icon className={cn('size-3.5 shrink-0', !active && 'opacity-40')} aria-hidden />
    </button>
  );
}

/** A linked task the list doesn't hold (e.g. done long ago) stays selectable. */
function withLinkedTask(tasks: { id: string; title: string }[], entry: BudgetEntry) {
  if (!entry.task || tasks.some((task) => task.id === entry.task!.id)) return tasks;
  return [entry.task, ...tasks];
}

/** Income, expenses and the result, estimated against actual. */
function Summary({ entries, filtered }: { entries: BudgetEntry[]; filtered: boolean }) {
  const t = useTranslations();
  const totals = budgetTotals(entries);
  const rows = [
    { key: 'income', label: t('budget.income'), pair: totals.income, result: false },
    { key: 'expense', label: t('budget.expenses'), pair: totals.expense, result: false },
    { key: 'result', label: t('budget.result'), pair: totals.result, result: true },
  ];
  return (
    <section aria-labelledby="budget-summary" className="rounded-3xl bg-card p-5">
      <h2 id="budget-summary" className="mb-3 flex items-center gap-2 text-base font-bold">
        {t('budget.summary')}
        {filtered && <Badge variant="warn">{t('budget.filtered')}</Badge>}
      </h2>
      <table className="w-full text-sm tabular-nums">
        <thead>
          <tr className="text-muted-foreground">
            <th scope="col" className="pb-2 text-left font-bold">
              <span className="sr-only">{t('budget.type')}</span>
            </th>
            <th scope="col" className="pb-2 text-right font-bold">
              {t('budget.estimated')}
            </th>
            <th scope="col" className="pb-2 text-right font-bold">
              {t('budget.actual')}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className={cn(row.result && 'border-t border-border font-bold')}>
              <th scope="row" className="py-1.5 text-left font-bold">
                {row.label}
              </th>
              <td
                className={cn('py-1.5 text-right', row.result && resultColor(row.pair.estimated))}
              >
                {formatCents(row.pair.estimated)}
              </td>
              <td className={cn('py-1.5 text-right', row.result && resultColor(row.pair.actual))}>
                {formatCents(row.pair.actual)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** A profit is green, a loss red; break-even stays neutral. */
const resultColor = (cents: number) =>
  cents > 0 ? 'text-status-ok' : cents < 0 ? 'text-status-bad' : undefined;

function Amount({ cents }: { cents: number | null }) {
  const t = useTranslations();
  return cents === null ? (
    <span className="text-muted-foreground">{t('budget.noAmount')}</span>
  ) : (
    <>{formatCents(cents)}</>
  );
}

function EntryRow({
  eventId,
  entry,
  labels,
  mayEdit,
  onOpen,
  onDelete,
}: {
  eventId: string;
  entry: BudgetEntry;
  labels: Label[];
  mayEdit: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations();
  const router = useRouter();
  // Tagging shows at once; the row is keyed by `updatedAt`, so fresh data replaces this.
  const [labelIds, setLabelIds] = useState(entry.labelIds);
  const tag = useAction(setBudgetEntryLabels.bind(null, eventId, entry.id), {
    onSuccess: () => router.refresh(),
    onError: ({ error }) => {
      setLabelIds(entry.labelIds);
      toast.error(t(error.serverError?.message ?? 'common.genericError'));
    },
  });
  const isIncome = entry.type === 'income';
  return (
    <li className={cn('flex items-center gap-2 px-4 py-2.5 sm:px-5')}>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <button
            type="button"
            onClick={onOpen}
            className="w-fit max-w-full truncate rounded-md pl-1 text-left font-bold underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <span className="sr-only">
              {isIncome ? t('budget.income') : t('budget.expenses')}:{' '}
            </span>
            {entry.title}
          </button>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pl-1 text-xs text-muted-foreground">
            {mayEdit ? (
              <LabelPopover
                eventId={eventId}
                labels={labels}
                value={labelIds}
                itemName={entry.title}
                onChange={(ids) => {
                  // Leave out labels deleted since this row was shown: the API refuses them.
                  const live = ids.filter((id) => labels.some((label) => label.id === id));
                  setLabelIds(live);
                  tag.execute({ labelIds: live });
                }}
              />
            ) : (
              labelsOf(labels, entry.labelIds).map((label) => (
                <LabelChip key={label.id} label={label} />
              ))
            )}
            {entry.task && <span className="truncate">{entry.task.title}</span>}
            {entry.fileCount > 0 && (
              <span className="inline-flex items-center gap-1">
                <Paperclip className="size-3.5" aria-hidden />
                {t('budget.fileCount', { count: entry.fileCount })}
              </span>
            )}
          </div>
        </div>
        <AmountColumns
          type={entry.type}
          estimated={entry.estimatedCents}
          actual={entry.actualCents}
        />
      </div>
      {mayEdit && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t('budget.entryActions', { title: entry.title })}
            >
              <MoreHorizontal aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onOpen}>{t('budget.open')}</DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={onDelete}>
              <Trash2 aria-hidden />
              {t('budget.delete')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </li>
  );
}

/** What members see in the sheet: the entry, read-only. */
function EntryDetails({ entry, labels }: { entry: BudgetEntry; labels: Label[] }) {
  const t = useTranslations();
  const entryLabels = labelsOf(labels, entry.labelIds);
  const rows: { label: string; value: React.ReactNode }[] = [
    { label: t('budget.form.type'), value: t(`budgetEntryType.${entry.type}`) },
    { label: t('budget.estimated'), value: <Amount cents={entry.estimatedCents} /> },
    { label: t('budget.actual'), value: <Amount cents={entry.actualCents} /> },
  ];
  if (entryLabels.length > 0) {
    rows.push({
      label: t('budget.labels'),
      value: (
        <span className="flex flex-wrap gap-1.5">
          {entryLabels.map((label) => (
            <LabelChip key={label.id} label={label} />
          ))}
        </span>
      ),
    });
  }
  if (entry.task) rows.push({ label: t('budget.form.task'), value: entry.task.title });
  if (entry.notes) {
    rows.push({
      label: t('budget.form.notes'),
      value: <span className="whitespace-pre-wrap">{entry.notes}</span>,
    });
  }
  return (
    <dl className="grid grid-cols-[8rem_minmax(0,1fr)] gap-x-3 text-sm">
      {rows.map((row) => (
        <div key={row.label} className="contents">
          <dt className="py-2 font-bold text-muted-foreground">{row.label}</dt>
          <dd className="py-2 tabular-nums">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function DeleteEntryDialog({
  eventId,
  entry,
  onClose,
  onDeleted,
}: {
  eventId: string;
  entry: BudgetEntry;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const t = useTranslations();
  const router = useRouter();
  const remove = useAction(deleteBudgetEntry.bind(null, eventId, entry.id), {
    onSuccess: () => {
      onDeleted();
      router.refresh();
    },
    onError: ({ error }) => toast.error(t(error.serverError?.message ?? 'common.genericError')),
  });
  return (
    <AlertDialog open onOpenChange={(isOpen) => !isOpen && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('budget.deleteTitle')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('budget.deleteWarning', { title: entry.title })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={remove.isPending}
            onClick={(event) => {
              // Keep the dialog open until the server answers.
              event.preventDefault();
              remove.execute();
            }}
          >
            {t('budget.deleteConfirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
