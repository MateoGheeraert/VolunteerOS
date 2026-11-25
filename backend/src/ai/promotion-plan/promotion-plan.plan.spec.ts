import { describe, expect, it } from 'vitest';
import type { Citation } from '../ai.types.js';
import { PROMO_CATALOG, type PromoCatalogItem } from './promotion-catalog.js';
import {
  MAX_PROMO_ACTIONS,
  dueDateFor,
  planPromotionActions,
  type PromotionPlanState,
} from './promotion-plan.plan.js';
import type { PromotionPlanOutput } from './promotion-plan.schema.js';

const item = (key: string) => PROMO_CATALOG.find((candidate) => candidate.key === key)!;
const catalogRefs = new Map<string, PromoCatalogItem>([
  ['C1', item('posters-local-shops')],
  ['C2', item('uitinvlaanderen')],
  ['C3', item('local-paid-social')],
]);
const refs = new Map<string, Citation>([
  ['E', { type: 'event', id: 'event-1', label: 'Kerstmarkt 2026' }],
  ['C1', { type: 'catalog', id: 'posters-local-shops', label: 'Affiches' }],
  ['C2', { type: 'catalog', id: 'uitinvlaanderen', label: 'UiTinVlaanderen' }],
  ['C3', { type: 'catalog', id: 'local-paid-social', label: 'Gesponsorde post' }],
  ['P', { type: 'event', id: 'event-0', label: 'Kerstmarkt 2025' }],
  ['P1', { type: 'task', id: 'task-old-1', label: 'Affiches ophangen' }],
  ['T1', { type: 'task', id: 'task-1', label: 'Facebook-evenement aanmaken' }],
]);

const state = (overrides: Partial<PromotionPlanState> = {}): PromotionPlanState => ({
  eventStartDate: '2026-12-19',
  today: '2026-11-25',
  availableCents: 30000,
  cheapMaxCents: 5000,
  existingTaskTitles: [],
  decidedKeys: new Set(),
  ...overrides,
});

type Action = PromotionPlanOutput['actions'][number];
const action = (overrides: Partial<Action> = {}): Action => ({
  title: 'Affiches bij de bakker en in de cafés',
  type: 'offline',
  audience: 'buurtbewoners en gezinnen',
  weeksBefore: 3,
  estimatedCostEuros: 80,
  effort: 'medium',
  why: 'Vorig jaar kwamen veel buren via de affiches.',
  howTo: '1. Ontwerp de affiche.\n2. Hang ze op.',
  cites: ['C1'],
  ...overrides,
});
const plan = (actions: Action[], overrides: Partial<PromotionPlanState> = {}) =>
  planPromotionActions({ actions }, refs, catalogRefs, state(overrides));

describe('planPromotionActions', () => {
  it('turns a cited action into a pending promo suggestion', () => {
    const result = plan([action()]);
    expect(result.dropped).toEqual([]);
    expect(result.totalCostCents).toBe(8000);
    expect(result.suggestions).toEqual([
      {
        kind: 'promo_action',
        dedupKey: 'promo:posters-local-shops',
        title: 'Affiches bij de bakker en in de cafés',
        explanation: 'Vorig jaar kwamen veel buren via de affiches.',
        payload: {
          catalogKey: 'posters-local-shops',
          title: 'Affiches bij de bakker en in de cafés',
          type: 'offline',
          audience: 'buurtbewoners en gezinnen',
          weeksBefore: 3,
          dueDate: '2026-11-28',
          estimatedCostCents: 8000,
          effort: 'medium',
          howTo: '1. Ontwerp de affiche.\n2. Hang ze op.',
        },
        citations: [refs.get('C1')],
      },
    ]);
  });

  it('accepts a repeat of a previous-edition task, keyed by that task', () => {
    const result = plan([action({ cites: ['P1', 'P'] })]);
    expect(result.suggestions[0]!.dedupKey).toBe('promo:task:task-old-1');
    expect(result.suggestions[0]!.payload.catalogKey).toBeNull();
  });

  it('drops actions citing nothing, only the event, or an unknown reference', () => {
    const result = plan([
      action({ title: 'Niets', cites: [] }),
      action({ title: 'Enkel het event', cites: ['E'] }),
      action({ title: 'Verzonnen', cites: ['C9'] }),
      action({ title: 'Deels verzonnen', cites: ['C1', 'X1'] }),
      action({ title: 'Lopende taak', cites: ['T1'] }),
    ]);
    expect(result.suggestions).toEqual([]);
    expect(result.dropped.map((d) => d.reason)).toEqual(Array(5).fill('unbacked'));
  });

  it('drops actions that are already a task, were decided before, or repeat a catalogue action', () => {
    const result = plan(
      [
        action({ title: 'facebook-evenement  aanmaken', cites: ['C2'] }),
        action({ title: 'UiT', cites: ['C2'] }),
        action({ title: 'Affiches', cites: ['C1'] }),
        action({ title: 'Nog affiches', cites: ['C1'] }),
      ],
      {
        existingTaskTitles: ['Facebook-evenement aanmaken'],
        decidedKeys: new Set(['promo:uitinvlaanderen']),
      },
    );
    expect(result.suggestions.map((s) => s.title)).toEqual(['Affiches']);
    expect(result.dropped.map((d) => d.reason)).toEqual(['exists', 'decided', 'duplicate']);
  });

  it('drops an action without a title', () => {
    const result = plan([action({ title: '   ' })]);
    expect(result.suggestions).toEqual([]);
    expect(result.dropped).toEqual([{ title: '', reason: 'empty' }]);
  });

  it('never prices an action below its catalogue minimum', () => {
    const minimum = item('posters-local-shops').costMinCents;
    const result = plan([action({ estimatedCostEuros: 0 })]);
    expect(result.suggestions[0]!.payload.estimatedCostCents).toBe(minimum);
    expect(result.totalCostCents).toBe(minimum);
  });

  it('trims the plan to the budget in Mila’s order, keeping free actions', () => {
    const result = plan(
      [
        action({ title: 'Affiches', estimatedCostEuros: 150, cites: ['C1'] }),
        action({ title: 'Gesponsorde post', estimatedCostEuros: 200, cites: ['C3'] }),
        action({ title: 'UiT', estimatedCostEuros: 0, cites: ['C2'] }),
      ],
      { availableCents: 30000 },
    );
    expect(result.suggestions.map((s) => s.title)).toEqual(['Affiches', 'UiT']);
    expect(result.dropped).toEqual([{ title: 'Gesponsorde post', reason: 'over_budget' }]);
    expect(result.totalCostCents).toBeLessThanOrEqual(30000);
  });

  it('keeps only cheap actions without a budget', () => {
    const result = plan(
      [
        action({ title: 'Affiches', estimatedCostEuros: 80, cites: ['C1'] }),
        action({ title: 'Gesponsorde post', estimatedCostEuros: 50, cites: ['C3'] }),
      ],
      { availableCents: null },
    );
    expect(result.suggestions.map((s) => s.title)).toEqual(['Gesponsorde post']);
    expect(result.dropped).toEqual([{ title: 'Affiches', reason: 'over_budget' }]);
  });

  it('never plans more than the maximum', () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      action({ title: `Taak ${i}`, cites: ['P1'], estimatedCostEuros: 0 }),
    );
    // Same backing (P1) would be a duplicate: give each its own key through distinct tasks.
    const ownRefs = new Map(refs);
    many.forEach((a, i) => {
      ownRefs.set(`P${i + 10}`, { type: 'task', id: `old-${i}`, label: a.title });
      a.cites = [`P${i + 10}`];
    });
    const result = planPromotionActions({ actions: many }, ownRefs, catalogRefs, state());
    expect(result.suggestions).toHaveLength(MAX_PROMO_ACTIONS);
    expect(result.dropped.filter((d) => d.reason === 'too_many')).toHaveLength(2);
  });

  it('never gives a due date in the past', () => {
    const result = plan([action({ weeksBefore: 8 })]);
    expect(result.suggestions[0]!.payload.dueDate).toBe('2026-11-25');
    expect(result.suggestions[0]!.payload.weeksBefore).toBe(3);
  });
});

describe('dueDateFor', () => {
  const dates = { eventStartDate: '2026-12-19', today: '2026-11-25' };

  it('counts whole weeks back from the start', () => {
    expect(dueDateFor(dates, 2)).toEqual({ dueDate: '2026-12-05', weeksBefore: 2 });
    expect(dueDateFor(dates, 0)).toEqual({ dueDate: '2026-12-19', weeksBefore: 0 });
  });

  it('moves a past date to today and clamps silly values', () => {
    expect(dueDateFor(dates, 10).dueDate).toBe('2026-11-25');
    expect(dueDateFor(dates, -3)).toEqual({ dueDate: '2026-12-19', weeksBefore: 0 });
  });
});
