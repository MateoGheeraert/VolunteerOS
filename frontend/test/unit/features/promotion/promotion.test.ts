import { describe, expect, it } from 'vitest';
import type { EventAudience, Label } from '@/api/generated/types.gen';
import {
  asIsPromoItem,
  audienceFormSchema,
  audienceToForm,
  buildTimeline,
  promoActionToTaskForm,
  toAudienceBody,
  type PromoAction,
  type PromotionTask,
} from '@/features/promotion/schemas';

const action = (overrides: Partial<PromoAction['payload']> = {}, id = crypto.randomUUID()) =>
  ({
    id,
    eventId: 'e5b1c1d0-0000-4000-8000-000000000001',
    kind: 'promo_action',
    status: 'pending',
    title: overrides.title ?? 'Affiches',
    explanation: 'Werkt goed in de buurt.',
    citations: [],
    createdAt: '2026-11-25T10:00:00.000Z',
    seenAt: null,
    answer: null,
    payload: {
      catalogKey: 'posters-local-shops',
      title: 'Affiches',
      type: 'offline',
      audience: 'buurtbewoners',
      weeksBefore: 3,
      dueDate: '2026-11-28',
      estimatedCostCents: 8000,
      effort: 'medium',
      howTo: '1. Ontwerp.\n2. Ophangen.',
      ...overrides,
    },
  }) satisfies PromoAction;

const task = (overrides: Partial<PromotionTask>): PromotionTask => ({
  id: crypto.randomUUID(),
  title: 'Taak',
  status: 'todo',
  priority: 'medium',
  dueDate: null,
  assigneeName: null,
  fromMila: false,
  ...overrides,
});

describe('buildTimeline', () => {
  const dates = { eventStartDate: '2026-12-19', today: '2026-11-25' };

  it('groups actions and tasks by weeks before the event, far ahead first', () => {
    const groups = buildTimeline({
      ...dates,
      actions: [action({ title: 'Affiches', dueDate: '2026-11-28' })],
      tasks: [
        task({ title: 'Facebook', dueDate: '2026-11-28', status: 'done' }),
        task({ title: 'Herinnering', dueDate: '2026-12-18' }),
        task({ title: 'Later', dueDate: null }),
        task({ title: 'Te laat', dueDate: '2026-11-20' }),
      ],
    });
    expect(groups.map((group) => [group.type, group.weeks])).toEqual([
      ['overdue', Number.MAX_SAFE_INTEGER],
      ['week', 3],
      ['week', 0],
      ['none', -1],
    ]);
    // Within a week: by date, the task before the suggestion on the same day.
    expect(
      groups[1]!.items.map((item) => (item.kind === 'task' ? item.task.title : item.action.title)),
    ).toEqual(['Facebook', 'Affiches']);
  });

  it('keeps a done task in its week even when its date passed', () => {
    const [group] = buildTimeline({
      ...dates,
      actions: [],
      tasks: [task({ dueDate: '2026-11-20', status: 'done' })],
    });
    expect(group).toMatchObject({ type: 'week', weeks: 4 });
  });
});

describe('promo action → task', () => {
  const promotie: Label = {
    id: 'l5b1c1d0-0000-4000-8000-000000000001',
    eventId: 'e5b1c1d0-0000-4000-8000-000000000001',
    name: 'promotie',
    color: 'purple',
  } as Label;

  it('fills the dialog with the how-to, due date and the Promotie label', () => {
    expect(promoActionToTaskForm(action(), [promotie])).toMatchObject({
      title: 'Affiches',
      description: '1. Ontwerp.\n2. Ophangen.',
      dueDate: '2026-11-28',
      labelIds: [promotie.id],
    });
    expect(promoActionToTaskForm(action(), []).labelIds).toEqual([]);
  });

  it('only asks for a budget line when the action costs something', () => {
    expect(asIsPromoItem(action(), true).addBudgetLine).toBe(true);
    expect(asIsPromoItem(action({ estimatedCostCents: 0 }), true).addBudgetLine).toBe(false);
    expect(asIsPromoItem(action(), false).addBudgetLine).toBe(false);
  });
});

describe('Publiek form', () => {
  const audience: EventAudience = {
    audiences: ['families', 'neighbours'],
    description: null,
    ageMin: 4,
    ageMax: 12,
    region: 'Gent',
    entryPriceCents: 1250,
    pitch: 'Kerstman',
    promotionBudgetCents: 30000,
  };

  it('round-trips through the form', () => {
    const form = audienceToForm(audience);
    expect(form).toMatchObject({ entry: 'paid', price: '12,50', budget: '300', ageMin: '4' });
    expect(toAudienceBody(audienceFormSchema.parse(form))).toEqual(audience);
  });

  it('keeps free entry and "not filled in" apart', () => {
    const free = audienceToForm({ ...audience, entryPriceCents: 0 });
    expect(free.entry).toBe('free');
    expect(toAudienceBody(free).entryPriceCents).toBe(0);
    const unknown = audienceToForm({ ...audience, entryPriceCents: null });
    expect(toAudienceBody(unknown).entryPriceCents).toBeNull();
  });

  it('refuses an upside-down age range and a bad amount', () => {
    const form = audienceToForm(audience);
    expect(audienceFormSchema.safeParse({ ...form, ageMin: '30' }).success).toBe(false);
    expect(audienceFormSchema.safeParse({ ...form, budget: '12,345 euro of zo' }).success).toBe(
      false,
    );
  });
});
