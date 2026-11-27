import { describe, expect, it } from 'vitest';
import type { ChecklistItem } from './budget-checklist.js';
import {
  buildBudgetReviewContext,
  type BudgetReviewContextInput,
  type ReviewBudgetLine,
} from './budget-review.context.js';
import { MAX_BUDGET_LINES, planBudgetReview, type BudgetPlanState } from './budget-review.plan.js';
import type { BudgetReviewOutput } from './budget-review.schema.js';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const line = (
  n: number,
  overrides: Partial<ReviewBudgetLine> & Pick<ReviewBudgetLine, 'title'>,
): ReviewBudgetLine => ({
  id: id(n),
  type: 'expense',
  labels: [],
  estimatedCents: null,
  actualCents: null,
  notes: null,
  supplier: null,
  ...overrides,
});

const CHECKLIST: ChecklistItem[] = [
  {
    key: 'unisono',
    title: 'Unisono (muziekrechten)',
    when: 'music is played',
    reason: 'Copyright.',
    keywords: ['unisono', 'muziekrecht'],
    minCents: 5_000,
    maxCents: 40_000,
  },
  {
    key: 'security',
    title: 'Erkende bewaking',
    when: 'a party',
    reason: 'Required.',
    keywords: ['bewaking'],
    minCents: 40_000,
    maxCents: 150_000,
    eventTypes: ['party', 'festival'],
  },
];

const input = (overrides: Partial<BudgetReviewContextInput> = {}): BudgetReviewContextInput => ({
  language: 'nl-BE',
  today: '2026-11-25',
  event: {
    id: id(100),
    name: 'Kerstmarkt 2026',
    eventType: 'market',
    description: 'Kerstmarkt met glühwein en een dj.',
    location: 'Kerkplein, Gent',
    startDate: '2026-12-19',
    endDate: '2026-12-19',
    expectedAttendance: 800,
  },
  previousEdition: {
    id: id(200),
    name: 'Kerstmarkt 2025',
    actualAttendance: 720,
    expectedAttendance: 600,
    retrospective: null,
    lines: [
      line(1, {
        title: 'Glühwein en drank',
        actualCents: 78_230,
        labels: ['Bar'],
        supplier: { id: id(301), name: 'Drankenhandel Peeters', archived: false },
      }),
      line(2, {
        title: 'Affiches drukken',
        actualCents: 11_980,
        supplier: { id: id(302), name: 'Drukkerij De Kopie', archived: true },
      }),
      line(3, { title: 'Vergunning stad', actualCents: 7_500 }),
      line(4, { title: 'Kerstmanpak', estimatedCents: 4_500 }),
      line(5, { type: 'income', title: 'Verkoop glühwein', actualCents: 212_040 }),
    ],
  },
  currentLines: [line(10, { title: 'Tenten huren', estimatedCents: 90_000 })],
  tasks: [
    { id: id(400), title: 'Kerstman regelen', hasBudgetLine: false },
    { id: id(401), title: 'Tenten opzetten', hasBudgetLine: true },
  ],
  earlierSuggestions: [],
  ...overrides,
});

const state = (overrides: Partial<BudgetPlanState> = {}): BudgetPlanState => ({
  existingTitles: ['Tenten huren'],
  labelIdsByName: new Map([['bar', id(500)]]),
  previousEditionName: 'Kerstmarkt 2025',
  previousAttendance: 720,
  expectedAttendance: 800,
  ...overrides,
});

type OutputLine = BudgetReviewOutput['lines'][number];
const out = (...lines: Partial<OutputLine>[]): BudgetReviewOutput => ({
  previousLines: [],
  checklist: [],
  lines: lines.map((item) => ({
    type: 'expense',
    title: 'Lijn',
    origin: 'typical',
    amountRef: null,
    taskRef: null,
    reason: 'Omdat.',
    cites: ['E'],
    ...item,
  })),
  insight: { headline: '  Je houdt ~€ 1660 over.  ', explanation: 'Uitleg.' },
});

function plan(output: BudgetReviewOutput, overrides: Partial<BudgetPlanState> = {}) {
  const context = buildBudgetReviewContext(input(), CHECKLIST);
  return planBudgetReview(output, context.refs, context.records, context.insight, state(overrides));
}

describe('budget review context', () => {
  it('numbers every record, with the computed figures and the applicable checklist', () => {
    const { prompt, refs, records } = buildBudgetReviewContext(input(), CHECKLIST);
    expect(prompt).toContain('[E] Kerstmarkt 2026');
    expect(prompt).toContain('expected visitors: 800');
    expect(prompt).toContain('[P] Kerstmarkt 2025');
    expect(prompt).toContain('actual visitors: 720');
    expect(prompt).toMatch(
      /\[P1\] expense \| Glühwein en drank \| actual € 782,30 \| grows with visitors \| labels: Bar \| supplier: Drankenhandel Peeters/,
    );
    expect(prompt).toContain('[P4] expense | Kerstmanpak | estimated € 45,00 | no actual amount');
    expect(prompt).toContain('[B1] expense | Tenten huren | estimated € 900,00');
    expect(prompt).toContain('[T1] Kerstman regelen');
    expect(prompt).toContain('[T2] Tenten opzetten (has a budget line)');
    // A market gets no security from the checklist.
    expect(prompt).toContain('[C1] Unisono (muziekrechten)');
    expect(prompt).not.toContain('Erkende bewaking');
    expect(prompt).toContain('expected result');
    expect(prompt).toMatch(/at 600 visitors \(-25%\)/);

    expect(refs.get('P1')).toEqual({
      type: 'budget_entry',
      id: id(1),
      label: 'Kerstmarkt 2025: Glühwein en drank',
    });
    expect(refs.get('C1')).toEqual({
      type: 'checklist',
      id: 'unisono',
      label: 'Unisono (muziekrechten)',
    });
    expect(records.tasks.get('T1')).toMatchObject({ id: id(400), title: 'Kerstman regelen' });
  });

  it('asks for a full draft on an empty budget, and says when there is no history', () => {
    const { prompt, insight } = buildBudgetReviewContext(
      input({ previousEdition: null, currentLines: [] }),
      CHECKLIST,
    );
    expect(prompt).toContain('No previous edition.');
    expect(prompt).toContain('Current budget: empty. Make a full draft');
    expect(prompt).toContain('No amounts yet');
    expect(insight.basis).toBe('none');
  });
});

describe('budget review planner', () => {
  it('scales last year’s actual amount for a variable line and copies its labels and supplier', () => {
    const { lines, dropped } = plan(
      out({ title: 'Glühwein en drank', amountRef: 'P1', cites: ['P1'], origin: 'typical' }),
    );
    expect(dropped).toEqual([]);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      dedupKey: 'budget_line:glühwein en drank',
      title: 'Glühwein en drank',
      payload: {
        type: 'expense',
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
        labelIds: [id(500)],
        supplier: { id: id(301), name: 'Drankenhandel Peeters' },
        task: null,
      },
    });
  });

  it('keeps a fixed cost at last year’s amount and drops an archived supplier', () => {
    const { lines } = plan(out({ title: 'Affiches', amountRef: 'P2', cites: ['E'] }));
    expect(lines[0]!.payload).toMatchObject({
      estimate: { basis: 'previous_edition', cents: 11_980, scaled: false, targetAttendance: null },
      supplier: null,
      labelIds: [],
    });
    // The basis is cited even when the model forgot it.
    expect(lines[0]!.citations.map((c) => c.id)).toEqual([id(100), id(2)]);
  });

  it('prices a checklist item at the middle of its richtprijs', () => {
    const { lines } = plan(
      out({ title: 'Unisono', amountRef: 'C1', cites: ['C1', 'E'], origin: 'checklist' }),
    );
    expect(lines[0]!.payload).toMatchObject({
      origin: 'checklist',
      estimate: {
        basis: 'richtprijs',
        cents: 23_000,
        checklistKey: 'unisono',
        minCents: 5_000,
        maxCents: 40_000,
      },
    });
  });

  it('keeps a line without an amount when its basis cannot back one', () => {
    const { lines, dropped } = plan(
      out(
        // No actual amount last year.
        { title: 'Kerstmanpak', amountRef: 'P4', cites: ['P4'] },
        // An income line on an expense.
        { type: 'income', title: 'Drankverkoop', amountRef: 'P1', cites: ['P1'] },
        // A checklist item is a cost, never income.
        { type: 'income', title: 'Muziek', amountRef: 'C1', cites: ['C1'] },
        // A current budget line is no basis.
        { title: 'Extra tent', amountRef: 'B1', cites: ['B1'] },
        // An unknown reference.
        { title: 'Nadar', amountRef: 'C9', cites: ['E'] },
      ),
    );
    expect(lines.map((l) => [l.title, l.payload.estimate])).toEqual([
      ['Kerstmanpak', null],
      ['Drankverkoop', null],
      ['Muziek', null],
      ['Extra tent', null],
      ['Nadar', null],
    ]);
    expect(dropped.map((d) => d.reason)).toEqual(Array(5).fill('amount_unbacked'));
  });

  it('never proposes an actual amount', () => {
    const { lines } = plan(
      out(
        { title: 'Glühwein en drank', amountRef: 'P1', cites: ['P1'] },
        { title: 'Unisono', amountRef: 'C1', cites: ['C1'] },
      ),
    );
    // Last year's actual amount is only the source of the estimate; the line itself has none.
    for (const planned of lines) {
      expect(Object.keys(planned.payload).sort()).toEqual(
        ['estimate', 'labelIds', 'origin', 'supplier', 'task', 'title', 'type'].sort(),
      );
      expect(planned.payload.estimate?.cents).toBeGreaterThan(0);
    }
  });

  it('drops lines without real citations, already budgeted, or duplicates', () => {
    const { lines, dropped } = plan(
      out(
        { title: 'Zonder bron', cites: [] },
        { title: 'Verzonnen', cites: ['P99'] },
        { title: 'tenten  HUREN', cites: ['E'] },
        // Continues a previous line whose title is already in the budget.
        { title: 'Tent', amountRef: 'P1', cites: ['P1'] },
        { title: 'Unisono', amountRef: 'C1', cites: ['C1'] },
        { title: 'unisono', cites: ['C1'] },
        { title: 'Muziekrechten', amountRef: 'C1', cites: ['C1'] },
      ),
      { existingTitles: ['Tenten huren', 'Glühwein en drank'] },
    );
    expect(lines.map((l) => l.title)).toEqual(['Unisono']);
    expect(dropped).toEqual([
      { title: 'Zonder bron', reason: 'unbacked' },
      { title: 'Verzonnen', reason: 'unbacked' },
      { title: 'tenten  HUREN', reason: 'exists' },
      { title: 'Tent', reason: 'exists' },
      { title: 'unisono', reason: 'duplicate' },
      { title: 'Muziekrechten', reason: 'duplicate' },
    ]);
  });

  it('links the task a cost belongs to', () => {
    const { lines } = plan(
      out({ title: 'Kerstmanpak huren', taskRef: 'T1', cites: ['T1'], origin: 'task' }),
    );
    expect(lines[0]!.payload).toMatchObject({
      origin: 'task',
      task: { id: id(400), title: 'Kerstman regelen' },
      estimate: null,
    });
  });

  it('decides the origin from what backs the line, not from the model', () => {
    const { lines } = plan(
      out(
        { title: 'A', cites: ['E'], origin: 'previous_edition' },
        { title: 'B', cites: ['P3'], origin: 'typical' },
        { title: 'C', cites: ['C1'], origin: 'typical' },
      ),
    );
    // Citing a checklist item without its richtprijs is no checklist line.
    expect(lines.map((l) => l.payload.origin)).toEqual(['typical', 'previous_edition', 'typical']);
  });

  it(`proposes at most ${MAX_BUDGET_LINES} lines`, () => {
    const many = Array.from({ length: MAX_BUDGET_LINES + 2 }, (_, i) => ({
      title: `Lijn ${i}`,
      cites: ['E'],
    }));
    const { lines, dropped } = plan(out(...many));
    expect(lines).toHaveLength(MAX_BUDGET_LINES);
    expect(dropped.filter((d) => d.reason === 'too_many')).toHaveLength(2);
  });

  it('puts the computed figures and Mila’s words in the insight', () => {
    const { insight } = plan(out());
    expect(insight).toMatchObject({
      kind: 'budget_insight',
      dedupKey: 'budget_insight',
      title: 'Je houdt ~€ 1660 over.',
      explanation: 'Uitleg.',
      payload: { basis: 'current', expenseCents: 90_000, expectedAttendance: 800 },
    });
    expect(insight.citations.map((c) => c.id)).toEqual([id(100), id(200)]);
  });

  it('proposes uncovered previous-edition lines and applicable checklist items from verdicts', () => {
    const verdict = { stillNeeded: true, reason: 'Vorig jaar ook.' };
    const { lines, dropped } = plan({
      ...out(),
      previousLines: [
        // Not covered: proposed from last year's amount.
        { ...verdict, ref: 'P1', coveredBy: null, title: 'Glühwein en drank' },
        // Covered by meaning: stays out.
        { ...verdict, ref: 'P3', coveredBy: 'B1', title: 'Vergunning' },
        // No longer needed.
        { ...verdict, ref: 'P2', coveredBy: null, stillNeeded: false, title: 'Affiches' },
        // Not a previous-edition line.
        { ...verdict, ref: 'C1', coveredBy: null, title: 'Verzonnen' },
      ],
      checklist: [
        { ref: 'C1', applies: true, coveredBy: null, title: 'Unisono', reason: 'Er is een dj.' },
        // Covered by a previous-edition line that is proposed anyway.
        { ref: 'C1', applies: true, coveredBy: 'P9', title: 'Muziek', reason: '…' },
        { ref: 'C2', applies: false, coveredBy: null, title: 'Bewaking', reason: 'Geen fuif.' },
      ],
    });
    expect(dropped).toEqual([]);
    expect(lines.map((l) => [l.title, l.payload.origin, l.payload.estimate?.basis])).toEqual([
      ['Glühwein en drank', 'previous_edition', 'previous_edition'],
      ['Unisono', 'checklist', 'richtprijs'],
    ]);
    expect(lines[1]!.citations.map((c) => c.type)).toEqual(['checklist', 'event']);
  });

  it('puts verdict lines before the model’s own, and drops the same cost twice', () => {
    const { lines, dropped } = plan({
      ...out({ title: 'Glühwein', amountRef: 'P1', cites: ['P1'] }),
      previousLines: [
        { ref: 'P1', coveredBy: null, stillNeeded: true, title: 'Drank', reason: '…' },
      ],
    });
    expect(lines.map((l) => l.title)).toEqual(['Drank']);
    expect(dropped).toEqual([{ title: 'Glühwein', reason: 'duplicate' }]);
  });

  it('never proposes a checklist cost the budget or another proposal already has', () => {
    const { lines, dropped } = plan(
      {
        ...out(),
        previousLines: [
          {
            ref: 'P1',
            coveredBy: null,
            stillNeeded: true,
            title: 'Unisono kerstmuziek',
            reason: '…',
          },
        ],
        // The model forgot that last year's line is this same cost.
        checklist: [{ ref: 'C1', applies: true, coveredBy: null, title: 'Muziek', reason: '…' }],
      },
      { existingTitles: ['Tenten huren'] },
    );
    expect(lines.map((l) => l.title)).toEqual(['Unisono kerstmuziek']);
    expect(dropped).toEqual([{ title: 'Muziek', reason: 'duplicate' }]);

    const inBudget = plan(
      {
        ...out(),
        checklist: [{ ref: 'C1', applies: true, coveredBy: null, title: 'Unisono', reason: '…' }],
      },
      { existingTitles: ['Muziekrechten (Unisono)'] },
    );
    expect(inBudget.lines).toEqual([]);
    expect(inBudget.dropped).toEqual([{ title: 'Unisono', reason: 'exists' }]);
  });
});
