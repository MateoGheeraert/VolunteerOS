import type { PromotionAudience } from '../../db/schema/index.js';
import {
  CHEAP_ACTION_MAX_CENTS,
  promotionBudget,
  promotionGuard,
  sizeBand,
} from '../../features/promotion/promotion-rules.js';
import { catalogFor } from '../promotion-plan/promotion-catalog.js';
import type { PromotionPlanContextInput } from '../promotion-plan/promotion-plan.context.js';
import type { PromotionPlan, PromotionPlanState } from '../promotion-plan/promotion-plan.plan.js';

/**
 * Live evaluation cases for the promotion plan (docs/info.md §7.11). Each case is an event as the
 * runner sees it; `preparePromotionCase` filters the catalogue and works out the budget exactly
 * like the runner, and the checks run on the planned result (after the server's rules). Checks
 * are code, not an LLM judge.
 */
export interface PromotionEvalCase {
  name: string;
  today: string;
  event: PromotionPlanContextInput['event'];
  audience: PromotionPlanContextInput['audience'];
  promotionBudgetCents: number | null;
  /** What the Promotie lines already cost. */
  spentCents?: number;
  previousEdition?: PromotionPlanContextInput['previousEdition'];
  currentPromotionTasks?: PromotionPlanContextInput['currentPromotionTasks'];
  instruction?: string;
  checks: { name: string; pass: (plan: PromotionPlan, state: PromotionPlanState) => boolean }[];
}

/** The context and planner state for a case, built the way the runner builds them. */
export function preparePromotionCase(testCase: PromotionEvalCase): {
  input: PromotionPlanContextInput;
  state: PromotionPlanState;
} {
  const guard = promotionGuard({
    audiences: testCase.audience.audiences,
    pitch: testCase.audience.pitch,
    expectedAttendance: testCase.event.expectedAttendance,
    today: testCase.today,
    eventStartDate: testCase.event.startDate,
    readOnly: false,
  });
  const budget = promotionBudget(
    testCase.promotionBudgetCents,
    testCase.spentCents
      ? [{ type: 'expense', estimatedCents: testCase.spentCents, actualCents: null }]
      : [],
  );
  const band = sizeBand(testCase.event.expectedAttendance);
  const catalog = catalogFor({
    audiences: testCase.audience.audiences,
    sizeBand: band,
    lastMinute: guard.lastMinute,
    availableCents: budget.availableCents,
    cheapMaxCents: CHEAP_ACTION_MAX_CENTS,
    excludedKeys: new Set(),
  });
  const currentPromotionTasks = testCase.currentPromotionTasks ?? [];
  return {
    input: {
      language: 'nl-BE',
      today: testCase.today,
      event: testCase.event,
      audience: testCase.audience,
      sizeBand: band,
      lastMinute: guard.lastMinute,
      budget,
      cheapMaxCents: CHEAP_ACTION_MAX_CENTS,
      catalog,
      previousEdition: testCase.previousEdition ?? null,
      currentPromotionTasks,
      earlierSuggestions: [],
      instruction: testCase.instruction ?? null,
    },
    state: {
      eventStartDate: testCase.event.startDate,
      today: testCase.today,
      availableCents: budget.availableCents,
      cheapMaxCents: CHEAP_ACTION_MAX_CENTS,
      existingTaskTitles: currentPromotionTasks.map((task) => task.title),
      decidedKeys: new Set(),
    },
  };
}

const ids = (n: number) => `e0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const event = (
  overrides: Partial<PromotionPlanContextInput['event']>,
): PromotionPlanContextInput['event'] => ({
  id: ids(1),
  name: 'Evenement',
  eventType: 'other',
  description: null,
  location: null,
  startDate: '2027-02-20',
  endDate: '2027-02-20',
  expectedAttendance: null,
  ...overrides,
});

const audience = (
  audiences: PromotionAudience[],
  overrides: Partial<PromotionPlanContextInput['audience']> = {},
): PromotionPlanContextInput['audience'] => ({
  audiences,
  description: null,
  ageMin: null,
  ageMax: null,
  region: null,
  entryPriceCents: null,
  pitch: null,
  ...overrides,
});

const text = (plan: PromotionPlan) =>
  plan.suggestions
    .map((s) => `${s.title} ${s.explanation} ${s.payload.howTo}`)
    .join(' ')
    .toLowerCase();

/** Every case: everything cited, no past due dates, within the money there is. */
const always: PromotionEvalCase['checks'] = [
  {
    name: 'every action cites the catalogue or last year',
    pass: (plan) => plan.dropped.every((d) => d.reason !== 'unbacked'),
  },
  {
    name: 'no due date in the past',
    pass: (plan, state) => plan.suggestions.every((s) => s.payload.dueDate >= state.today),
  },
  {
    name: 'cost within budget',
    pass: (plan, state) =>
      plan.dropped.every((d) => d.reason !== 'over_budget') &&
      (state.availableCents === null
        ? plan.suggestions.every((s) => s.payload.estimatedCostCents <= state.cheapMaxCents)
        : plan.totalCostCents <= state.availableCents),
  },
  { name: 'at most 10 actions', pass: (plan) => plan.suggestions.length <= 10 },
];

export const STUDENT_PARTY = 'Student party (16–25, M)';
export const FAMILY_DAY = 'Family day (gezinnen, S, no budget)';

export const PROMOTION_PLAN_CASES: PromotionEvalCase[] = [
  {
    name: STUDENT_PARTY,
    today: '2026-11-25',
    event: event({
      name: 'Winterfuif KLJ Merkem',
      eventType: 'party',
      description: 'Fuif in de sporthal met drie dj’s en een bar, tot 3u.',
      location: 'Sporthal Merkem',
      startDate: '2027-01-30',
      endDate: '2027-01-31',
      expectedAttendance: 900,
    }),
    audience: audience(['young_adults', 'students', 'music_lovers'], {
      description: 'Jongeren uit de regio en studenten die in het weekend thuis zijn.',
      ageMin: 16,
      ageMax: 25,
      region: 'Houthulst, Diksmuide, Ieper',
      entryPriceCents: 1200,
      pitch: 'Drie dj’s met als afsluiter Lost Frequencies-coverband, vat bier aan €2.',
    }),
    promotionBudgetCents: 25000,
    checks: [
      ...always,
      { name: '6–10 actions', pass: (plan) => plan.suggestions.length >= 6 },
      {
        name: 'reaches students online or on campus',
        pass: (plan) =>
          plan.suggestions.some(
            (s) =>
              ['social', 'giveaway'].includes(s.payload.type) ||
              s.payload.catalogKey === 'flyers-higher-education' ||
              s.payload.catalogKey === 'student-associations',
          ),
      },
    ],
  },
  {
    name: FAMILY_DAY,
    today: '2026-11-25',
    event: event({
      name: 'Speelnamiddag Gezinsbond Lovendegem',
      eventType: 'other',
      description: 'Springkastelen, schmink en pannenkoeken in de parochiezaal.',
      location: 'Parochiezaal Lovendegem',
      startDate: '2027-02-14',
      endDate: '2027-02-14',
      expectedAttendance: 150,
    }),
    audience: audience(['young_families', 'families', 'children'], {
      ageMin: 2,
      ageMax: 10,
      region: 'Lievegem',
      entryPriceCents: 0,
      pitch: 'Gratis springkastelen, schmink en een pannenkoek voor elk kind.',
    }),
    promotionBudgetCents: null,
    checks: [
      ...always,
      { name: 'at least 5 actions', pass: (plan) => plan.suggestions.length >= 5 },
      {
        name: 'reaches families through school or youth movements',
        pass: (plan) =>
          plan.suggestions.some((s) =>
            [
              'flyers-schools',
              'school-newsletter',
              'youth-movement-word-of-mouth',
              'whatsapp-chain',
            ].includes(s.payload.catalogKey ?? ''),
          ),
      },
    ],
  },
  {
    name: 'Kerstmarkt with history (late printer)',
    today: '2026-11-15',
    event: event({
      id: ids(3),
      name: 'Kerstmarkt 2026',
      eventType: 'market',
      description: 'Kerstmarkt op het kerkplein met kraampjes, glühwein en een kerstman.',
      location: 'Kerkplein, Gent',
      startDate: '2026-12-19',
      endDate: '2026-12-19',
      expectedAttendance: 800,
    }),
    audience: audience(['families', 'young_families', 'neighbours'], {
      region: 'Gent',
      entryPriceCents: 0,
      pitch: 'Twintig kraampjes, glühwein en chocomelk, en om 16u komt de kerstman langs.',
    }),
    promotionBudgetCents: 30000,
    spentCents: 13420,
    previousEdition: {
      id: ids(2),
      name: 'Kerstmarkt 2025',
      startDate: '2025-12-20',
      expectedAttendance: 600,
      actualAttendance: 720,
      retrospective:
        'Glühwein was om 19u op: dubbele voorraad bestellen. Kassa had te weinig wisselgeld.',
      promotionTasks: [
        {
          id: 't0000000-0000-4000-8000-000000000001',
          title: 'Affiches ophangen in de buurt',
          description: 'Bakker, apotheek, cafés en de school.',
          status: 'done',
          dueDate: '2025-12-08',
          budgetLines: [
            {
              title: 'Affiches drukken',
              estimatedCents: 10000,
              actualCents: 11980,
              notes: 'Te laat geleverd: dit jaar een andere drukker.',
            },
          ],
        },
        {
          id: 't0000000-0000-4000-8000-000000000002',
          title: 'Facebook-evenement aanmaken',
          description: null,
          status: 'done',
          dueDate: '2025-11-15',
          budgetLines: [],
        },
        {
          id: 't0000000-0000-4000-8000-000000000003',
          title: 'Flyers meegeven via de lagere school',
          description: null,
          status: 'todo',
          dueDate: '2025-11-29',
          budgetLines: [],
        },
      ],
      otherBudgetLines: [],
    },
    checks: [
      ...always,
      { name: '6–10 actions', pass: (plan) => plan.suggestions.length >= 6 },
      {
        name: 'the late printer comes through',
        pass: (plan) => /drukker|drukkerij|op tijd|tijdig|vroeger bestellen/.test(text(plan)),
      },
    ],
  },
  {
    name: 'Nearly empty Publiek',
    today: '2026-11-25',
    event: event({
      name: 'Quiz',
      eventType: 'quiz',
      startDate: '2027-03-12',
      endDate: '2027-03-12',
    }),
    audience: audience(['adults']),
    promotionBudgetCents: null,
    checks: [...always, { name: 'still a plan', pass: (plan) => plan.suggestions.length >= 3 }],
  },
  {
    name: 'Event in two weeks',
    today: '2026-11-25',
    event: event({
      name: 'Eetfestijn VC De Mol',
      eventType: 'meal',
      location: 'Zaal De Mol, Kortemark',
      startDate: '2026-12-09',
      endDate: '2026-12-09',
      expectedAttendance: 350,
    }),
    audience: audience(['families', 'neighbours', 'sporty', 'associations'], {
      entryPriceCents: 1800,
      pitch: 'Stoofvlees met friet of vol-au-vent, ten voordele van de jeugdwerking.',
    }),
    promotionBudgetCents: 10000,
    checks: [
      ...always,
      { name: 'at least 2 actions', pass: (plan) => plan.suggestions.length >= 2 },
      {
        name: 'only last-minute actions (at most 2 weeks before)',
        pass: (plan) => plan.suggestions.every((s) => s.payload.weeksBefore <= 2),
      },
    ],
  },
];

/** Students and families are reached differently: the plans share at most half their actions. */
export function differentPicks(a: PromotionPlan, b: PromotionPlan): boolean {
  const keys = (plan: PromotionPlan) =>
    new Set(plan.suggestions.map((s) => s.payload.catalogKey).filter((key) => key !== null));
  const left = keys(a);
  const right = keys(b);
  const shared = [...left].filter((key) => right.has(key)).length;
  return shared <= Math.min(left.size, right.size) / 2;
}
