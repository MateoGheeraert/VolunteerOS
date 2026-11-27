import { MAX_BUDGET_CENTS } from '../../db/schema/budget.js';
import type { BudgetInsightPayload } from '../ai.types.js';

/**
 * The arithmetic behind "Mila, bekijk mijn begroting": which lines grow with the visitors, how a
 * previous edition's amount scales to this one, and the insight's figures. Pure and in code, so
 * every number Mila shows can be checked; the model only puts them in words.
 */

export interface MathLine {
  type: 'income' | 'expense';
  title: string;
  /** Label names. */
  labels: string[];
  estimatedCents: number | null;
  actualCents: number | null;
}

/**
 * Words that make a line grow with the number of visitors: what visitors buy or pay to get in.
 * Everything else (the tent, the permit, the posters, a sponsor) is a fixed amount.
 */
const VARIABLE_WORDS = [
  'drank',
  'drink',
  'dranken',
  'glühwein',
  'gluhwein',
  'bier',
  'wijn',
  'frisdrank',
  'cava',
  'jenever',
  'koffie',
  'soep',
  'eten',
  'maaltijd',
  'spaghetti',
  'friet',
  'frieten',
  'hamburger',
  'hotdog',
  'pannenkoek',
  'wafel',
  'snack',
  'catering',
  'consumptie',
  'consumpties',
  'drankkaart',
  'drankbon',
  'jeton',
  'jetons',
  'bonnetje',
  'bonnetjes',
  'inkom',
  'ticket',
  'tickets',
  'kaartverkoop',
  'toegang',
  'tombola',
];
const VARIABLE_PATTERN = new RegExp(
  `(^|[^\\p{L}])(${VARIABLE_WORDS.join('|')})|(^|[^\\p{L}])bar($|[^\\p{L}])`,
  'iu',
);
/** Words that make a line a fixed cost, whatever else it names: "Tent bar" is the tent. */
const FIXED_WORDS = [
  'tent',
  'huur',
  'verhuur',
  'vergunning',
  'podium',
  'verzekering',
  'sponsor',
  'subsidie',
];
const FIXED_PATTERN = new RegExp(`(^|[^\\p{L}])(${FIXED_WORDS.join('|')})`, 'iu');

/**
 * Whether a line grows with the visitors, by its title: drinks, food, tickets and the like do,
 * unless a word makes it a fixed cost. Labels don't count: "Bar" labels a tent as much as beer.
 */
export function isVariable(line: Pick<MathLine, 'title'>): boolean {
  return VARIABLE_PATTERN.test(line.title) && !FIXED_PATTERN.test(line.title);
}

/** The amount a line is planned at: its estimate, else its actual amount. */
export const plannedCents = (line: Pick<MathLine, 'estimatedCents' | 'actualCents'>) =>
  line.estimatedCents ?? line.actualCents ?? 0;

/** Scaled and richtprijs estimates are rough: to € 10, or to € 1 under € 10. */
export function roundEstimate(cents: number): number {
  const step = cents >= 1_000 ? 1_000 : 100;
  return Math.round(cents / step) * step;
}

/** A visitor ratio, or null when either number is missing or zero. */
function visitorRatio(from: number | null, to: number | null): number | null {
  return from && to ? to / from : null;
}

/**
 * The previous edition's actual amount of a line, as an estimate for this edition: scaled by the
 * visitors (and rounded) when the line grows with them and both visitor numbers are known, else
 * exactly last year's amount.
 */
export function scaleFromPrevious(
  line: Pick<MathLine, 'title' | 'labels'> & { actualCents: number },
  previousAttendance: number | null,
  expectedAttendance: number | null,
): { cents: number; scaled: boolean } {
  const ratio = visitorRatio(previousAttendance, expectedAttendance);
  if (ratio === null || !isVariable(line)) {
    return { cents: line.actualCents, scaled: false };
  }
  // Never more than a budget line can hold.
  return {
    cents: Math.min(MAX_BUDGET_CENTS, roundEstimate(line.actualCents * ratio)),
    scaled: true,
  };
}

/** The proposed estimate for a richtprijs range: its middle. */
export const richtprijsEstimate = (minCents: number, maxCents: number) =>
  roundEstimate((minCents + maxCents) / 2);

/** Visitor changes the insight shows the result for. */
export const SCENARIO_CHANGES = [-25, 25] as const;

export interface InsightInput {
  currentLines: MathLine[];
  expectedAttendance: number | null;
  previousEdition: {
    name: string;
    /** Its actual visitors. */
    attendance: number | null;
    lines: MathLine[];
  } | null;
}

/**
 * The insight's figures. The basis is the current budget; an empty budget with a previous edition
 * is compared with that edition's settled lines scaled to this one (what a draft would be).
 * Per-visitor figures need the previous edition's visitors; scenarios need this event's
 * expected visitors. Without either, only the result and the fixed/variable split.
 */
export function budgetInsight(input: InsightInput): BudgetInsightPayload {
  const { previousEdition: previous, expectedAttendance } = input;
  const settled = (previous?.lines ?? []).filter(
    (line): line is MathLine & { actualCents: number } => line.actualCents !== null,
  );

  let basis: BudgetInsightPayload['basis'] = 'none';
  let lines: { type: MathLine['type']; cents: number; variable: boolean }[] = [];
  if (input.currentLines.length > 0) {
    basis = 'current';
    lines = input.currentLines.map((line) => ({
      type: line.type,
      cents: plannedCents(line),
      variable: isVariable(line),
    }));
  } else if (settled.length > 0) {
    basis = 'previous_edition';
    lines = settled.map((line) => ({
      type: line.type,
      cents: scaleFromPrevious(line, previous!.attendance, expectedAttendance).cents,
      variable: isVariable(line),
    }));
  }

  const split = {
    fixedIncomeCents: 0,
    variableIncomeCents: 0,
    fixedExpenseCents: 0,
    variableExpenseCents: 0,
  };
  for (const line of lines) {
    if (line.type === 'income') {
      if (line.variable) split.variableIncomeCents += line.cents;
      else split.fixedIncomeCents += line.cents;
    } else if (line.variable) split.variableExpenseCents += line.cents;
    else split.fixedExpenseCents += line.cents;
  }
  const incomeCents = split.fixedIncomeCents + split.variableIncomeCents;
  const expenseCents = split.fixedExpenseCents + split.variableExpenseCents;
  const resultCents = incomeCents - expenseCents;

  let perVisitor: BudgetInsightPayload['perVisitor'] = null;
  if (previous?.attendance && settled.length > 0) {
    const per = (cents: number) => Math.round(cents / previous.attendance!);
    const sum = (type: MathLine['type']) =>
      settled.filter((line) => line.type === type).reduce((total, l) => total + l.actualCents, 0);
    perVisitor = {
      incomeCents: per(sum('income')),
      expenseCents: per(sum('expense')),
      lines: settled
        .filter((line) => isVariable(line))
        .map((line) => ({ type: line.type, title: line.title, cents: per(line.actualCents) })),
    };
  }

  const scenarios: BudgetInsightPayload['scenarios'] = [];
  if (expectedAttendance && basis !== 'none') {
    for (const changePercent of SCENARIO_CHANGES) {
      const attendance = Math.round(expectedAttendance * (1 + changePercent / 100));
      const ratio = attendance / expectedAttendance;
      const scenarioResult = Math.round(
        split.fixedIncomeCents +
          split.variableIncomeCents * ratio -
          split.fixedExpenseCents -
          split.variableExpenseCents * ratio,
      );
      scenarios.push({
        attendance,
        changePercent,
        resultCents: scenarioResult,
        differenceCents: scenarioResult - resultCents,
      });
    }
  }

  return {
    basis,
    expectedAttendance,
    previousEdition: previous ? { name: previous.name, attendance: previous.attendance } : null,
    incomeCents,
    expenseCents,
    resultCents,
    split,
    perVisitor,
    scenarios,
  };
}
