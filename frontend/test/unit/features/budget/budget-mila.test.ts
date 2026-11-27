import { describe, expect, it } from 'vitest';
import {
  budgetLineAsIsItem,
  budgetLineToForm,
  type BudgetLineSuggestion,
} from '@/features/ai/schemas';
import { budgetEntryFormSchema, toBudgetEntryBody } from '@/features/budget/schemas';

const BAR = 'b5b1c1d0-0000-4000-8000-0000000000aa';
const GONE = 'b5b1c1d0-0000-4000-8000-0000000000bb';
const SUPPLIER = 'b5b1c1d0-0000-4000-8000-0000000000cc';
const TASK = 'b5b1c1d0-0000-4000-8000-0000000000dd';

const suggestion = (
  payload: Partial<BudgetLineSuggestion['payload']> = {},
): BudgetLineSuggestion => ({
  id: 'b5b1c1d0-0000-4000-8000-000000000001',
  eventId: 'b5b1c1d0-0000-4000-8000-000000000002',
  kind: 'budget_line',
  status: 'pending',
  title: 'Glühwein en drank',
  explanation: 'Vorig jaar had je dit ook.',
  citations: [],
  answer: null,
  createdAt: '2026-11-25T10:00:00.000Z',
  seenAt: null,
  payload: {
    type: 'expense',
    title: 'Glühwein en drank',
    origin: 'previous_edition',
    estimate: {
      basis: 'previous_edition',
      cents: 87_000,
      source: {
        eventName: 'Kerstmarkt 2025',
        title: 'Glühwein en drank',
        actualCents: 78_230,
        attendance: 720,
      },
      targetAttendance: 800,
      scaled: true,
    },
    labelIds: [BAR, GONE],
    supplier: { id: SUPPLIER, name: 'Drankenhandel Peeters' },
    task: { id: TASK, title: 'Glühwein bestellen' },
    ...payload,
  },
});

describe("Mila's budget lines", () => {
  it('fill in the form with her estimate only, and labels that still exist', () => {
    const values = budgetLineToForm(suggestion(), [{ id: BAR }]);
    expect(values).toEqual({
      type: 'expense',
      title: 'Glühwein en drank',
      estimated: '870',
      actual: '',
      notes: '',
      taskId: TASK,
      supplierId: SUPPLIER,
      labelIds: [BAR],
    });
    expect(toBudgetEntryBody(budgetEntryFormSchema.parse(values))).toMatchObject({
      estimatedCents: 87_000,
      actualCents: null,
    });
  });

  it('leave the amount empty when nothing backs one', () => {
    const values = budgetLineToForm(
      suggestion({ estimate: null, supplier: null, task: null, labelIds: [] }),
      [],
    );
    expect(values).toMatchObject({ estimated: '', supplierId: '', taskId: '' });
    // The form asks for an amount before it can be added.
    expect(budgetEntryFormSchema.safeParse(values).success).toBe(false);
  });

  it('can be added as proposed only with an estimate', () => {
    expect(budgetLineAsIsItem(suggestion(), [{ id: BAR }])).toEqual({
      suggestionId: 'b5b1c1d0-0000-4000-8000-000000000001',
      type: 'expense',
      title: 'Glühwein en drank',
      estimatedCents: 87_000,
      labelIds: [BAR],
      supplierId: SUPPLIER,
      taskId: TASK,
    });
    expect(budgetLineAsIsItem(suggestion({ estimate: null }), [])).toBeNull();
  });

  it('leaves out a supplier archived or a task deleted since the review', () => {
    const nothingPickable = { supplierIds: new Set<string>(), taskIds: new Set<string>() };
    expect(budgetLineAsIsItem(suggestion(), [{ id: BAR }], nothingPickable)).toMatchObject({
      supplierId: null,
      taskId: null,
    });
    expect(budgetLineToForm(suggestion(), [{ id: BAR }], nothingPickable)).toMatchObject({
      supplierId: '',
      taskId: '',
    });
  });
});
