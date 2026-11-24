import { describe, expect, it } from 'vitest';
import type { BudgetEntry } from '@/api/generated/types.gen';
import {
  budgetTotals,
  DEFAULT_BUDGET_SORT,
  filterEntries,
  isFiltered,
  nextSort,
  NO_BUDGET_FILTERS,
  sortEntries,
} from '@/features/budget/budget-totals';
import {
  budgetEntryFormSchema,
  budgetEntryToForm,
  effectiveType,
  emptyBudgetEntry,
  toBudgetEntryBody,
} from '@/features/budget/schemas';

const entry = (overrides: Partial<BudgetEntry>): BudgetEntry => ({
  id: crypto.randomUUID(),
  eventId: 'b5b1c1d0-0000-4000-8000-000000000001',
  type: 'expense',
  title: 'Tent huren',
  estimatedCents: null,
  actualCents: null,
  notes: null,
  task: null,
  supplier: null,
  labelIds: [],
  fileCount: 0,
  createdAt: '2026-11-24T10:00:00.000Z',
  updatedAt: '2026-11-24T10:00:00.000Z',
  ...overrides,
});

describe('budgetTotals', () => {
  it('adds income and expenses per column, and the result is income minus expenses', () => {
    const totals = budgetTotals([
      entry({ type: 'income', estimatedCents: 120000, actualCents: 134550 }),
      entry({ type: 'income', estimatedCents: 50000, actualCents: 50000 }),
      entry({ type: 'expense', estimatedCents: 45000, actualCents: 44950 }),
      entry({ type: 'expense', estimatedCents: 30000, actualCents: 31210 }),
    ]);
    expect(totals).toEqual({
      income: { estimated: 170000, actual: 184550 },
      expense: { estimated: 75000, actual: 76160 },
      result: { estimated: 95000, actual: 108390 },
    });
  });

  it('counts a missing amount as 0 in its own column, without mixing in the other one', () => {
    const totals = budgetTotals([
      // Not paid yet: only estimated.
      entry({ type: 'expense', estimatedCents: 45000 }),
      // Never estimated: only actual.
      entry({ type: 'expense', actualCents: 2500 }),
    ]);
    expect(totals.expense).toEqual({ estimated: 45000, actual: 2500 });
  });

  it('shows a loss as a negative result', () => {
    const totals = budgetTotals([
      entry({ type: 'income', actualCents: 10000 }),
      entry({ type: 'expense', actualCents: 25050 }),
    ]);
    expect(totals.result.actual).toBe(-15050);
  });

  it('is exact where floats would not be', () => {
    // 0.1 + 0.2 !== 0.3 in floats; in cents it is 10 + 20 = 30.
    const totals = budgetTotals([
      entry({ type: 'income', actualCents: 10 }),
      entry({ type: 'income', actualCents: 20 }),
    ]);
    expect(totals.income.actual).toBe(30);
  });

  it('is all zeros for an empty budget', () => {
    expect(budgetTotals([]).result).toEqual({ estimated: 0, actual: 0 });
  });
});

describe('filterEntries', () => {
  const bar = 'b5b1c1d0-0000-4000-8000-0000000000aa';
  const entries = [
    entry({ type: 'income', title: 'Tickets' }),
    entry({ type: 'expense', title: 'Drank', labelIds: [bar] }),
    entry({ type: 'income', title: 'Bar', labelIds: [bar] }),
  ];
  const titles = (list: BudgetEntry[]) => list.map((e) => e.title);

  it('keeps everything without filters', () => {
    expect(titles(filterEntries(entries, NO_BUDGET_FILTERS))).toEqual(['Tickets', 'Drank', 'Bar']);
    expect(isFiltered(NO_BUDGET_FILTERS)).toBe(false);
  });

  it('filters by type and by label, together', () => {
    const by = (filters: Partial<typeof NO_BUDGET_FILTERS>) =>
      titles(filterEntries(entries, { ...NO_BUDGET_FILTERS, ...filters }));
    expect(by({ type: 'income' })).toEqual(['Tickets', 'Bar']);
    expect(by({ labelId: bar })).toEqual(['Drank', 'Bar']);
    expect(by({ type: 'expense', labelId: bar })).toEqual(['Drank']);
    expect(isFiltered({ ...NO_BUDGET_FILTERS, labelId: bar })).toBe(true);
  });

  it('filters by supplier', () => {
    const brewery = { id: 'b5b1c1d0-0000-4000-8000-0000000000cc', name: 'Brouwer', archived: true };
    const withSupplier = [...entries, entry({ title: 'Vaten', supplier: brewery })];
    const filters = { ...NO_BUDGET_FILTERS, supplierId: brewery.id };
    expect(titles(filterEntries(withSupplier, filters))).toEqual(['Vaten']);
    expect(isFiltered(filters)).toBe(true);
  });
});

describe('budgetEntryFormSchema', () => {
  const valid = { ...emptyBudgetEntry('expense'), title: 'Tent huren', estimated: '450' };

  it('needs at least one amount', () => {
    const result = budgetEntryFormSchema.safeParse({ ...valid, estimated: '' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toMatchObject({
      path: ['estimated'],
      message: 'budget.validation.amountRequired',
    });
  });

  it('explains an amount it cannot read', () => {
    const message = (actual: string) =>
      budgetEntryFormSchema.safeParse({ ...valid, actual }).error?.issues[0]?.message;
    expect(message('12,345')).toBeUndefined(); // thousands: 12345
    expect(message('12,3456')).toBe('budget.validation.amountDecimals');
    expect(message('vijf')).toBe('budget.validation.amountInvalid');
    expect(message('10.000.000')).toBe('budget.validation.amountTooLarge');
  });
});

describe('toBudgetEntryBody', () => {
  it('turns typed amounts into cents and empty fields into null', () => {
    const values = budgetEntryFormSchema.parse({
      ...emptyBudgetEntry('income'),
      title: ' Inkomkaarten ',
      estimated: '1.250,50',
      actual: '',
    });
    expect(toBudgetEntryBody(values)).toEqual({
      type: 'income',
      title: 'Inkomkaarten',
      estimatedCents: 125050,
      actualCents: null,
      notes: null,
      taskId: null,
      supplierId: null,
      labelIds: [],
    });
  });

  it('round-trips an entry through the form', () => {
    const existing = entry({
      estimatedCents: 45000,
      actualCents: 44950,
      notes: 'Offerte',
      task: { id: 'b5b1c1d0-0000-4000-8000-0000000000bb', title: 'Tent zoeken' },
      supplier: { id: 'b5b1c1d0-0000-4000-8000-0000000000cc', name: 'Tenten', archived: false },
    });
    const values = budgetEntryFormSchema.parse(budgetEntryToForm(existing));
    expect(toBudgetEntryBody(values)).toMatchObject({
      estimatedCents: 45000,
      actualCents: 44950,
      notes: 'Offerte',
      taskId: existing.task!.id,
      supplierId: existing.supplier!.id,
    });
  });
});

describe('a typed sign decides income or cost', () => {
  const body = (type: 'income' | 'expense', estimated: string, actual = '') =>
    toBudgetEntryBody(
      budgetEntryFormSchema.parse({ ...emptyBudgetEntry(type), title: 'x', estimated, actual }),
    );

  it('makes "-500" a cost, even when income is selected', () => {
    expect(body('income', '-500')).toMatchObject({ type: 'expense', estimatedCents: 50000 });
    expect(body('income', '−1.250,50')).toMatchObject({ type: 'expense', estimatedCents: 125050 });
    expect(body('income', '€ -12,50')).toMatchObject({ type: 'expense', estimatedCents: 1250 });
  });

  it('makes "+500" an income, even when a cost is selected', () => {
    expect(body('expense', '+500')).toMatchObject({ type: 'income', estimatedCents: 50000 });
    expect(body('expense', '', '+250')).toMatchObject({ type: 'income', actualCents: 25000 });
  });

  it('keeps the selected type without a sign, and one signed amount is enough', () => {
    expect(body('income', '500')).toMatchObject({ type: 'income' });
    expect(body('expense', '500')).toMatchObject({ type: 'expense' });
    expect(body('income', '-500', '480')).toMatchObject({
      type: 'expense',
      estimatedCents: 50000,
      actualCents: 48000,
    });
  });

  it('refuses a + in one amount and a − in the other', () => {
    const result = budgetEntryFormSchema.safeParse({
      ...emptyBudgetEntry('income'),
      title: 'x',
      estimated: '+500',
      actual: '-500',
    });
    expect(result.error?.issues[0]).toMatchObject({
      path: ['actual'],
      message: 'budget.validation.amountSignsConflict',
    });
    // The quick-add row shows what the line would become meanwhile: what is selected.
    expect(effectiveType({ type: 'income', estimated: '+5', actual: '-5' })).toBe('income');
  });

  it('does not take a sign alone for an amount', () => {
    for (const estimated of ['-', '+', ' − ', '€ -']) {
      const result = budgetEntryFormSchema.safeParse({
        ...emptyBudgetEntry('income'),
        title: 'x',
        estimated,
      });
      expect(result.error?.issues[0]?.message).toBe('budget.validation.amountRequired');
    }
  });

  it('still refuses what is not an amount after the sign', () => {
    const message = budgetEntryFormSchema.safeParse({
      ...emptyBudgetEntry('income'),
      title: 'x',
      estimated: '--5',
    }).error?.issues[0]?.message;
    expect(message).toBe('budget.validation.amountInvalid');
  });
});

describe('sortEntries', () => {
  const at = (minute: number) => `2026-11-24T10:${String(minute).padStart(2, '0')}:00.000Z`;
  const entries = [
    entry({ title: 'tent', type: 'expense', estimatedCents: 45000, createdAt: at(1) }),
    entry({ title: 'Bar', type: 'income', estimatedCents: 30000, createdAt: at(2) }),
    entry({
      title: 'affiches',
      type: 'expense',
      estimatedCents: null,
      actualCents: 2000,
      createdAt: at(3),
    }),
    entry({ title: 'Tickets', type: 'income', estimatedCents: 120000, createdAt: at(4) }),
  ];
  const titles = (list: BudgetEntry[]) => list.map((e) => e.title);

  it('shows the newest first by default', () => {
    expect(titles(sortEntries(entries, DEFAULT_BUDGET_SORT))).toEqual([
      'Tickets',
      'affiches',
      'Bar',
      'tent',
    ]);
  });

  it('sorts descriptions A to Z, ignoring case', () => {
    expect(titles(sortEntries(entries, { key: 'title', direction: 'asc' }))).toEqual([
      'affiches',
      'Bar',
      'tent',
      'Tickets',
    ]);
  });

  it('sorts amounts by what they do to the result, lines without that amount last', () => {
    expect(titles(sortEntries(entries, { key: 'estimated', direction: 'desc' }))).toEqual([
      'Tickets',
      'Bar',
      'tent',
      'affiches',
    ]);
    expect(titles(sortEntries(entries, { key: 'estimated', direction: 'asc' }))).toEqual([
      'tent',
      'Bar',
      'Tickets',
      'affiches',
    ]);
  });

  it('does not change the list it gets', () => {
    sortEntries(entries, { key: 'title', direction: 'asc' });
    expect(titles(entries)).toEqual(['tent', 'Bar', 'affiches', 'Tickets']);
  });
});

describe('nextSort', () => {
  it('cycles a column: natural order, reversed, back to newest first', () => {
    const first = nextSort(DEFAULT_BUDGET_SORT, 'actual');
    expect(first).toEqual({ key: 'actual', direction: 'desc' });
    const second = nextSort(first, 'actual');
    expect(second).toEqual({ key: 'actual', direction: 'asc' });
    expect(nextSort(second, 'actual')).toEqual(DEFAULT_BUDGET_SORT);
    expect(nextSort(DEFAULT_BUDGET_SORT, 'title')).toEqual({ key: 'title', direction: 'asc' });
  });

  it('starts over on another column', () => {
    expect(nextSort({ key: 'title', direction: 'desc' }, 'estimated')).toEqual({
      key: 'estimated',
      direction: 'desc',
    });
  });
});
