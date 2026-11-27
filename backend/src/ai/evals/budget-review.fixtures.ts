import type {
  BudgetReviewContextInput,
  ReviewBudgetLine,
} from '../budget-review/budget-review.context.js';
import type { BudgetPlan } from '../budget-review/budget-review.plan.js';

/**
 * Live evaluation cases for "Mila, bekijk mijn begroting". Each case is an event as the context
 * builder sees it, plus checks on the planned result (after the server's rules). Checks are code,
 * not an LLM judge. Add a case for every bug a pilot organizer reports.
 */
export interface BudgetEvalCase {
  name: string;
  input: BudgetReviewContextInput;
  checks: { name: string; pass: (plan: BudgetPlan) => boolean }[];
}

const id = (prefix: string, n: number) =>
  `${prefix}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

let lineNumber = 0;
const line = (
  overrides: Partial<ReviewBudgetLine> & Pick<ReviewBudgetLine, 'title'>,
): ReviewBudgetLine => ({
  id: id('b', ++lineNumber),
  type: 'expense',
  labels: [],
  estimatedCents: null,
  actualCents: null,
  notes: null,
  supplier: null,
  ...overrides,
});

const event = (
  overrides: Partial<BudgetReviewContextInput['event']>,
): BudgetReviewContextInput['event'] => ({
  id: id('e', 1),
  name: 'Evenement',
  eventType: 'other',
  description: null,
  location: null,
  startDate: '2026-12-19',
  endDate: '2026-12-19',
  expectedAttendance: null,
  ...overrides,
});

const titles = (plan: BudgetPlan) => plan.lines.map((l) => l.title.toLowerCase());
const anyTitle = (plan: BudgetPlan, pattern: RegExp) => titles(plan).some((t) => pattern.test(t));

/** Every case: only real records, every amount backed by its basis, never an actual amount. */
const always: BudgetEvalCase['checks'] = [
  {
    name: 'cites only real records',
    pass: (plan) => plan.dropped.every((d) => d.reason !== 'unbacked'),
  },
  {
    // The planner only computes an amount from a valid basis; this checks the model named one.
    name: 'every amount is backed (no unbacked amount refs)',
    pass: (plan) =>
      plan.dropped.every((d) => d.reason !== 'amount_unbacked') &&
      plan.lines.every(
        (l) =>
          l.payload.estimate === null ||
          (l.payload.estimate.basis === 'previous_edition'
            ? l.citations.some((c) => c.type === 'budget_entry')
            : l.citations.some((c) => c.type === 'checklist')),
      ),
  },
  {
    name: 'no actual amounts',
    pass: (plan) => plan.lines.every((l) => !('actualCents' in l.payload)),
  },
  { name: 'at most 15 lines', pass: (plan) => plan.lines.length <= 15 },
  { name: 'an insight in words', pass: (plan) => plan.insight.explanation.length > 20 },
];

export const BUDGET_REVIEW_CASES: BudgetEvalCase[] = [
  {
    name: 'Kerstmarkt with history: lines last year had',
    input: {
      language: 'nl-BE',
      today: '2026-11-25',
      event: event({
        name: 'Kerstmarkt 2026',
        eventType: 'market',
        description: 'Kerstmarkt op het kerkplein met kraampjes, glühwein en een kerstman.',
        location: 'Kerkplein, Gent',
        expectedAttendance: 800,
      }),
      previousEdition: {
        id: id('e', 2),
        name: 'Kerstmarkt 2025',
        actualAttendance: 720,
        expectedAttendance: 600,
        retrospective: 'Glühwein was om 19u op: dubbele voorraad bestellen.',
        lines: [
          line({ type: 'income', title: 'Standgeld kraampjes', actualCents: 157_500 }),
          line({
            type: 'income',
            title: 'Verkoop glühwein en drank',
            actualCents: 212_040,
            labels: ['Bar'],
          }),
          line({ title: 'Glühwein en drank', actualCents: 78_230, labels: ['Bar'] }),
          line({ title: 'Tenten huren', actualCents: 85_000 }),
          line({ title: 'Affiches drukken', actualCents: 11_980 }),
          line({ title: 'Toelating evenement gemeente', actualCents: 7_500 }),
          line({ title: 'Verzekering BA organisator', actualCents: 18_500 }),
          line({ title: 'Afvalcontainer', actualCents: 14_350 }),
          line({
            title: 'Unisono kerstmuziek',
            actualCents: 16_280,
            notes: 'Achtergrondmuziek op het plein.',
          }),
        ],
      },
      currentLines: [
        line({ type: 'income', title: 'Standgeld kraampjes', estimatedCents: 180_000 }),
        line({ type: 'income', title: 'Verkoop glühwein en drank', estimatedCents: 320_000 }),
        line({ title: 'Glühwein en drank', estimatedCents: 145_000 }),
        line({ title: 'Tenten huren', estimatedCents: 90_000 }),
        line({ title: 'Affiches drukken', estimatedCents: 12_000 }),
        line({ title: 'Vergunning stad', estimatedCents: 7_500 }),
        line({ title: 'Verlichting en elektriciteit', estimatedCents: 18_000 }),
      ],
      tasks: [
        {
          id: id('a', 1),
          title: 'Springkasteel reserveren voor de kinderen',
          hasBudgetLine: false,
        },
        { id: id('a', 2), title: 'Tenten opzetten', hasBudgetLine: true },
      ],
      earlierSuggestions: [],
    },
    checks: [
      ...always,
      {
        name: 'proposes the insurance from last year',
        pass: (plan) => anyTitle(plan, /verzekering|ba\b|aansprakelijk/),
      },
      {
        name: 'proposes waste and Unisono from last year, with last year’s amount',
        pass: (plan) =>
          ['afval', 'unisono'].every((word) =>
            plan.lines.some(
              (l) =>
                l.title.toLowerCase().includes(word) &&
                l.payload.estimate?.basis === 'previous_edition',
            ),
          ),
      },
      {
        name: 'does not propose the permit again ("Vergunning stad" is there)',
        pass: (plan) => !anyTitle(plan, /vergunning|toelating/),
      },
      {
        name: 'does not propose power again ("Verlichting en elektriciteit" is there)',
        pass: (plan) => !anyTitle(plan, /stroom|elektriciteit|generator/),
      },
      {
        name: 'insight has scenarios',
        pass: (plan) => plan.insight.payload.scenarios.length === 2,
      },
    ],
  },
  {
    name: 'Spaghettiavond, empty budget, no history',
    input: {
      language: 'nl-BE',
      today: '2026-11-25',
      event: event({
        name: 'Spaghettiavond 2027',
        eventType: 'meal',
        location: 'Parochiezaal Sint-Jan, Gent',
        startDate: '2027-02-08',
        endDate: '2027-02-08',
        expectedAttendance: 250,
      }),
      previousEdition: null,
      currentLines: [],
      tasks: [],
      earlierSuggestions: [],
    },
    checks: [
      ...always,
      { name: 'drafts a budget', pass: (plan) => plan.lines.length >= 4 },
      {
        name: 'drafts income too',
        pass: (plan) => plan.lines.some((l) => l.payload.type === 'income'),
      },
      {
        name: 'nothing from a previous edition',
        pass: (plan) => plan.lines.every((l) => l.payload.estimate?.basis !== 'previous_edition'),
      },
      {
        name: 'insight without history has no scenarios',
        pass: (plan) =>
          plan.insight.payload.basis === 'none' && plan.insight.payload.scenarios.length === 0,
      },
    ],
  },
  {
    name: 'Festival with music, no Unisono or insurance line',
    input: {
      language: 'nl-BE',
      today: '2026-11-25',
      event: event({
        name: 'Zomerfestival De Wei',
        eventType: 'festival',
        description: 'Openluchtfestival met drie bands, een dj, een bar en foodtrucks.',
        location: 'Weide achter de sporthal, Merkem',
        startDate: '2027-07-10',
        endDate: '2027-07-10',
        expectedAttendance: 1500,
      }),
      previousEdition: null,
      currentLines: [
        line({ type: 'income', title: 'Inkomkaarten', estimatedCents: 1_500_000 }),
        line({ type: 'income', title: 'Drankverkoop bar', estimatedCents: 900_000 }),
        line({ title: 'Bands en dj', estimatedCents: 600_000 }),
        line({ title: 'Podium en geluid', estimatedCents: 450_000 }),
        line({ title: 'Drank inkoop', estimatedCents: 350_000 }),
        line({ title: 'Tent bar', estimatedCents: 120_000 }),
      ],
      tasks: [],
      earlierSuggestions: [],
    },
    checks: [
      ...always,
      {
        name: 'flags Unisono for the music',
        pass: (plan) =>
          plan.lines.some(
            (l) =>
              (l.payload.estimate?.basis === 'richtprijs' &&
                l.payload.estimate.checklistKey === 'unisono') ||
              /unisono|sabam|muziekrechten|auteursrechten/.test(l.title.toLowerCase()),
          ),
      },
      {
        name: 'flags the organizers’ insurance',
        pass: (plan) => anyTitle(plan, /verzekering|aansprakelijk/),
      },
    ],
  },
  {
    name: 'Festival: the organizer says insurance is arranged and hotdogs are sold',
    input: {
      language: 'nl-BE',
      today: '2026-11-25',
      event: event({
        name: 'Zomerfestival De Wei',
        eventType: 'festival',
        description: 'Openluchtfestival met drie bands, een dj, een bar en foodtrucks.',
        location: 'Weide achter de sporthal, Merkem',
        startDate: '2027-07-10',
        endDate: '2027-07-10',
        expectedAttendance: 1500,
      }),
      previousEdition: null,
      currentLines: [
        line({ type: 'income', title: 'Inkomkaarten', estimatedCents: 1_500_000 }),
        line({ type: 'income', title: 'Drankverkoop bar', estimatedCents: 900_000 }),
        line({ title: 'Bands en dj', estimatedCents: 600_000 }),
        line({ title: 'Podium en geluid', estimatedCents: 450_000 }),
      ],
      tasks: [],
      earlierSuggestions: [],
      instruction:
        'De verzekering loopt via de gemeente, die hoeft niet. We verkopen dit jaar ook zelf hotdogs.',
    },
    checks: [
      ...always,
      {
        name: 'no insurance line: the organizer ruled it out',
        pass: (plan) => !anyTitle(plan, /verzekering|aansprakelijk/),
      },
      {
        name: 'hotdog lines from the request, citing it',
        pass: (plan) =>
          plan.lines.some(
            (l) =>
              /hotdog|worst/.test(l.title.toLowerCase()) &&
              l.payload.origin === 'request' &&
              l.citations.some((c) => c.type === 'request'),
          ),
      },
    ],
  },
];
