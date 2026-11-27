import { describe, expect, it } from 'vitest';
import { checklistFor } from './budget-checklist.js';
import {
  budgetInsight,
  isVariable,
  plannedCents,
  richtprijsEstimate,
  roundEstimate,
  scaleFromPrevious,
  type MathLine,
} from './budget-review.math.js';

const line = (overrides: Partial<MathLine> & Pick<MathLine, 'title'>): MathLine => ({
  type: 'expense',
  labels: [],
  estimatedCents: null,
  actualCents: null,
  ...overrides,
});

describe('variable lines', () => {
  it('grows with visitors for what they buy or pay to get in', () => {
    expect(isVariable(line({ title: 'Glühwein en drank' }))).toBe(true);
    expect(isVariable(line({ title: 'Verkoop dranken' }))).toBe(true);
    expect(isVariable(line({ title: 'Inkomkaarten' }))).toBe(true);
    expect(isVariable(line({ title: 'Tombola' }))).toBe(true);
    expect(isVariable(line({ title: 'Drankverkoop bar' }))).toBe(true);
  });

  it('reads the title only, and a fixed word wins', () => {
    // A "Bar" label is on the tent as much as on the beer.
    expect(isVariable(line({ title: 'Aankoop', labels: ['Bar'] }))).toBe(false);
    expect(isVariable(line({ title: 'Tent bar' }))).toBe(false);
    expect(isVariable(line({ title: 'Barricades' }))).toBe(false);
  });

  it('keeps fixed costs fixed, also when a word only appears inside another', () => {
    expect(isVariable(line({ title: 'Tenten huren' }))).toBe(false);
    expect(isVariable(line({ title: 'Vergunning stad' }))).toBe(false);
    expect(isVariable(line({ title: 'Affiches drukken' }))).toBe(false);
    expect(isVariable(line({ title: 'Standgeld kraampjes' }))).toBe(false);
    // Only at the start of a word: "bar" in "Kinderopvang Rubarbertje" or "eten" in "Beveiliging
    // feeten" doesn't count.
    expect(isVariable(line({ title: 'Kinderopvang Rubarbertje' }))).toBe(false);
  });
});

describe('estimates', () => {
  it('rounds to € 10, or € 1 under € 10', () => {
    expect(roundEstimate(86_922)).toBe(87_000);
    expect(roundEstimate(84_999)).toBe(85_000);
    expect(roundEstimate(649)).toBe(600);
    expect(roundEstimate(0)).toBe(0);
  });

  it('plans a line at its estimate, else its actual amount', () => {
    expect(plannedCents({ estimatedCents: 100, actualCents: 90 })).toBe(100);
    expect(plannedCents({ estimatedCents: null, actualCents: 90 })).toBe(90);
    expect(plannedCents({ estimatedCents: null, actualCents: null })).toBe(0);
  });

  it('scales a variable line by the visitor ratio: € 782 at 720 → ~€ 870 at 800', () => {
    const gluhwein = { title: 'Glühwein en drank', labels: [], actualCents: 78_230 };
    expect(scaleFromPrevious(gluhwein, 720, 800)).toEqual({ cents: 87_000, scaled: true });
  });

  it('keeps fixed costs and unknown visitor numbers at exactly last year’s amount', () => {
    const tent = { title: 'Tenten huren', labels: [], actualCents: 85_000 };
    expect(scaleFromPrevious(tent, 720, 800)).toEqual({ cents: 85_000, scaled: false });
    const drinks = { title: 'Drank', labels: [], actualCents: 78_230 };
    expect(scaleFromPrevious(drinks, null, 800)).toEqual({ cents: 78_230, scaled: false });
    expect(scaleFromPrevious(drinks, 720, null)).toEqual({ cents: 78_230, scaled: false });
    expect(scaleFromPrevious(drinks, 0, 800)).toEqual({ cents: 78_230, scaled: false });
  });

  it('proposes the middle of a richtprijs range', () => {
    expect(richtprijsEstimate(5_000, 40_000)).toBe(23_000);
    expect(richtprijsEstimate(10_000, 35_000)).toBe(23_000);
    expect(richtprijsEstimate(0, 15_000)).toBe(8_000);
  });
});

describe('checklist', () => {
  it('filters by event type and expected visitors', () => {
    const keys = (type: Parameters<typeof checklistFor>[0], visitors: number | null) =>
      checklistFor(type, visitors).map((item) => item.key);
    expect(keys('festival', 1500)).toEqual(
      expect.arrayContaining(['unisono', 'insurance', 'first_aid', 'security', 'toilets']),
    );
    // A meal in a hall: no security, toilets, power or fences, and too small for first aid.
    const meal = keys('meal', 250);
    expect(meal).toEqual(expect.arrayContaining(['unisono', 'insurance', 'waste']));
    for (const key of ['security', 'toilets', 'power', 'fences', 'first_aid']) {
      expect(meal).not.toContain(key);
    }
    // Unknown size: thresholds can't rule an item out.
    expect(keys('party', null)).toEqual(expect.arrayContaining(['first_aid', 'security']));
  });
});

describe('insight', () => {
  const previousLines: MathLine[] = [
    line({ type: 'income', title: 'Verkoop glühwein en drank', actualCents: 212_040 }),
    line({ type: 'income', title: 'Standgeld kraampjes', actualCents: 157_500 }),
    line({ title: 'Glühwein en drank', actualCents: 78_230 }),
    line({ title: 'Tenten huren', actualCents: 85_000 }),
    // Never settled: left out of the history.
    line({ title: 'Kerstmanpak', estimatedCents: 4_500 }),
  ];

  it('computes the result, the split, per-visitor figures and scenarios', () => {
    const insight = budgetInsight({
      currentLines: [
        line({ type: 'income', title: 'Verkoop glühwein en drank', estimatedCents: 320_000 }),
        line({ type: 'income', title: 'Tombola', actualCents: 31_250 }),
        line({ type: 'income', title: 'Subsidie', estimatedCents: 50_000 }),
        line({ title: 'Glühwein en drank', estimatedCents: 145_000, actualCents: 138_765 }),
        line({ title: 'Tenten huren', estimatedCents: 90_000 }),
      ],
      expectedAttendance: 800,
      previousEdition: { name: 'Kerstmarkt 2025', attendance: 720, lines: previousLines },
    });
    expect(insight).toMatchObject({
      basis: 'current',
      incomeCents: 401_250,
      expenseCents: 235_000,
      resultCents: 166_250,
      split: {
        fixedIncomeCents: 50_000,
        variableIncomeCents: 351_250,
        fixedExpenseCents: 90_000,
        variableExpenseCents: 145_000,
      },
      perVisitor: {
        // (2120,40 + 1575) / 720 and (782,30 + 850) / 720
        incomeCents: 513,
        expenseCents: 227,
        lines: [
          { type: 'income', title: 'Verkoop glühwein en drank', cents: 295 },
          { type: 'expense', title: 'Glühwein en drank', cents: 109 },
        ],
      },
    });
    // At 600 visitors the variable part shrinks by a quarter: (3512,50 − 1450) × 0,25 = 515,63.
    expect(insight.scenarios).toEqual([
      { attendance: 600, changePercent: -25, resultCents: 114_688, differenceCents: -51_562 },
      { attendance: 1000, changePercent: 25, resultCents: 217_813, differenceCents: 51_563 },
    ]);
  });

  it('uses the previous edition scaled to this one when the budget is empty', () => {
    const insight = budgetInsight({
      currentLines: [],
      expectedAttendance: 800,
      previousEdition: { name: 'Kerstmarkt 2025', attendance: 720, lines: previousLines },
    });
    expect(insight.basis).toBe('previous_edition');
    // € 2120,40 × 800/720 = € 2356 → € 2360; the stall fees and the tent stay as they were.
    expect(insight.split).toEqual({
      fixedIncomeCents: 157_500,
      variableIncomeCents: 236_000,
      fixedExpenseCents: 85_000,
      variableExpenseCents: 87_000,
    });
    expect(insight.resultCents).toBe(157_500 + 236_000 - 85_000 - 87_000);
  });

  it('without history gives the result, the split and the scenarios', () => {
    const insight = budgetInsight({
      currentLines: [
        line({ type: 'income', title: 'Verkoop maaltijden', estimatedCents: 300_000 }),
        line({ title: 'Zaalhuur', estimatedCents: 40_000 }),
      ],
      expectedAttendance: 250,
      previousEdition: null,
    });
    expect(insight).toMatchObject({
      basis: 'current',
      resultCents: 260_000,
      perVisitor: null,
      previousEdition: null,
    });
    // 25% fewer guests (188 of 250): the meals sell less, the hall costs the same.
    expect(insight.scenarios.map((s) => s.differenceCents)).toEqual([-74_400, 75_600]);
  });

  it('has nothing to compute for an empty budget without history', () => {
    const insight = budgetInsight({
      currentLines: [],
      expectedAttendance: 250,
      previousEdition: null,
    });
    expect(insight).toMatchObject({ basis: 'none', resultCents: 0, scenarios: [] });
  });

  it('skips per-visitor figures when last edition’s visitors are unknown', () => {
    const insight = budgetInsight({
      currentLines: [],
      expectedAttendance: 800,
      previousEdition: { name: 'Kerstmarkt 2025', attendance: null, lines: previousLines },
    });
    expect(insight.perVisitor).toBeNull();
    // Nothing scaled without last year's visitors, but the scenarios still follow this year's.
    expect(insight.split.variableExpenseCents).toBe(78_230);
    expect(insight.scenarios).toHaveLength(2);
  });
});
