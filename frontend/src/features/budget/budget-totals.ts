import type { BudgetEntry } from '@/api/generated/types.gen';

/** Estimated and actual euro cents. */
export interface AmountPair {
  estimated: number;
  actual: number;
}

export interface BudgetTotals {
  income: AmountPair;
  expense: AmountPair;
  /** Income minus expenses: positive is a profit, negative a loss. */
  result: AmountPair;
}

type Amounts = Pick<BudgetEntry, 'type' | 'estimatedCents' | 'actualCents'>;

/**
 * The budget's totals. Each column only adds what it has: an entry without an actual amount
 * counts as 0 in "Werkelijk" (its estimate is not mixed in), and the same for the estimate.
 * Integer cents throughout, so the sums are exact.
 */
export function budgetTotals(entries: Amounts[]): BudgetTotals {
  const income = { estimated: 0, actual: 0 };
  const expense = { estimated: 0, actual: 0 };
  for (const entry of entries) {
    const sums = entry.type === 'income' ? income : expense;
    sums.estimated += entry.estimatedCents ?? 0;
    sums.actual += entry.actualCents ?? 0;
  }
  return {
    income,
    expense,
    result: {
      estimated: income.estimated - expense.estimated,
      actual: income.actual - expense.actual,
    },
  };
}

export interface BudgetFilters {
  type: 'all' | BudgetEntry['type'];
  /** 'all', or one label's id. */
  labelId: string;
  /** 'all', or one supplier's id. */
  supplierId: string;
}

export const NO_BUDGET_FILTERS: BudgetFilters = { type: 'all', labelId: 'all', supplierId: 'all' };

export const isFiltered = (filters: BudgetFilters) =>
  filters.type !== 'all' || filters.labelId !== 'all' || filters.supplierId !== 'all';

export function filterEntries<E extends Pick<BudgetEntry, 'type' | 'labelIds' | 'supplier'>>(
  entries: E[],
  filters: BudgetFilters,
): E[] {
  return entries.filter(
    (entry) =>
      (filters.type === 'all' || entry.type === filters.type) &&
      (filters.labelId === 'all' || entry.labelIds.includes(filters.labelId)) &&
      (filters.supplierId === 'all' || entry.supplier?.id === filters.supplierId),
  );
}

export type BudgetSortKey = 'created' | 'title' | 'estimated' | 'actual';
export interface BudgetSort {
  key: BudgetSortKey;
  direction: 'asc' | 'desc';
}

/** Newest first: a line typed in the row on top shows up right under it. */
export const DEFAULT_BUDGET_SORT: BudgetSort = { key: 'created', direction: 'desc' };

/**
 * Clicking a column: first its natural order (A to Z, largest amount first), then the reverse,
 * then back to newest first.
 */
export function nextSort(current: BudgetSort, key: Exclude<BudgetSortKey, 'created'>): BudgetSort {
  const first: BudgetSort['direction'] = key === 'title' ? 'asc' : 'desc';
  if (current.key !== key) return { key, direction: first };
  if (current.direction === first) return { key, direction: first === 'asc' ? 'desc' : 'asc' };
  return DEFAULT_BUDGET_SORT;
}

/** An amount as it counts in the result: income positive, an expense negative. */
const signed = (entry: Pick<BudgetEntry, 'type'>, cents: number | null) =>
  cents === null ? null : entry.type === 'income' ? cents : -cents;

/**
 * The entries in the chosen order. Amounts sort by what they do to the result, so income comes
 * before costs when largest first; lines without that amount always go last. Ties keep newest
 * first.
 */
export function sortEntries<
  E extends Pick<
    BudgetEntry,
    'id' | 'type' | 'title' | 'estimatedCents' | 'actualCents' | 'createdAt'
  >,
>(entries: E[], sort: BudgetSort): E[] {
  const factor = sort.direction === 'asc' ? 1 : -1;
  const newestFirst = (a: E, b: E) => b.createdAt.localeCompare(a.createdAt);
  return entries.toSorted((a, b) => {
    if (sort.key === 'created') {
      return factor * (a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    }
    if (sort.key === 'title') {
      return (
        factor * a.title.localeCompare(b.title, 'nl', { sensitivity: 'base' }) || newestFirst(a, b)
      );
    }
    const field = sort.key === 'estimated' ? 'estimatedCents' : 'actualCents';
    const x = signed(a, a[field]);
    const y = signed(b, b[field]);
    if (x === null || y === null) {
      if (x === y) return newestFirst(a, b);
      return x === null ? 1 : -1;
    }
    return factor * (x - y) || newestFirst(a, b);
  });
}
