import { describe, expect, it } from 'vitest';
import { PROMO_CATALOG } from './promotion-catalog.js';
import {
  buildPromotionPlanContext,
  type PromotionPlanContextInput,
} from './promotion-plan.context.js';

const input = (overrides: Partial<PromotionPlanContextInput> = {}): PromotionPlanContextInput => ({
  language: 'nl-BE',
  today: '2026-11-25',
  event: {
    id: 'event-1',
    name: 'Kerstmarkt 2026',
    eventType: 'market',
    description: 'Kraampjes en glühwein',
    location: 'Kerkplein, Gent',
    startDate: '2026-12-19',
    endDate: '2026-12-19',
    expectedAttendance: 800,
  },
  audience: {
    audiences: ['families', 'neighbours'],
    description: null,
    ageMin: null,
    ageMax: null,
    region: 'Gent',
    entryPriceCents: 0,
    pitch: 'De kerstman komt langs',
  },
  sizeBand: 'M',
  lastMinute: false,
  budget: { budgetCents: 30000, spentCents: 13420, availableCents: 16580 },
  cheapMaxCents: 5000,
  catalog: PROMO_CATALOG.slice(0, 2),
  previousEdition: {
    id: 'event-0',
    name: 'Kerstmarkt 2025',
    startDate: '2025-12-20',
    expectedAttendance: 600,
    actualAttendance: 720,
    retrospective: 'Glühwein was op.',
    promotionTasks: [
      {
        id: 'task-old-1',
        title: 'Affiches ophangen',
        description: null,
        status: 'done',
        dueDate: '2025-12-06',
        budgetLines: [
          {
            title: 'Affiches drukken',
            estimatedCents: 10000,
            actualCents: 11980,
            notes: 'Te laat geleverd: dit jaar een andere drukker.',
          },
        ],
      },
    ],
    otherBudgetLines: [],
  },
  currentPromotionTasks: [
    { id: 'task-1', title: 'Facebook-evenement aanmaken', dueDate: '2026-11-15', status: 'done' },
  ],
  earlierSuggestions: [{ title: 'WhatsApp-ketting', status: 'rejected' }],
  instruction: 'meer Instagram, geen drukwerk',
  ...overrides,
});

describe('buildPromotionPlanContext', () => {
  it('numbers the catalogue, last year’s tasks and the current tasks, and maps them back', () => {
    const { prompt, refs, catalogRefs } = buildPromotionPlanContext(input());
    expect(prompt).toContain('[C1] Affiches in lokale winkels en cafés');
    expect(prompt).toContain('[P1] Affiches ophangen | done | due 14 days before');
    expect(prompt).toContain('[T1] Facebook-evenement aanmaken');
    expect(refs.get('C2')).toEqual({
      type: 'catalog',
      id: PROMO_CATALOG[1]!.key,
      label: PROMO_CATALOG[1]!.title,
    });
    expect(refs.get('P1')).toEqual({ type: 'task', id: 'task-old-1', label: 'Affiches ophangen' });
    expect(catalogRefs.get('C1')!.key).toBe('posters-local-shops');
  });

  it('passes last year’s cost notes, visitors and lessons', () => {
    const { prompt } = buildPromotionPlanContext(input());
    expect(prompt).toContain('note: Te laat geleverd: dit jaar een andere drukker.');
    expect(prompt).toContain('visitors: expected 600, actual 720');
    expect(prompt).toContain('lessons learned: Glühwein was op.');
  });

  it('states the audience, budget, size band and the organizer’s instruction', () => {
    const { prompt } = buildPromotionPlanContext(input());
    expect(prompt).toContain('target groups: gezinnen, buurtbewoners');
    expect(prompt).toContain('entry: free');
    expect(prompt).toContain('available €165.80');
    expect(prompt).toContain('size band: M');
    expect(prompt).toContain('The organizer asks: "meer Instagram, geen drukwerk"');
    expect(prompt).toContain('- WhatsApp-ketting (rejected)');
  });

  it('says when there is no budget, no pitch, and when it is last-minute', () => {
    const { prompt } = buildPromotionPlanContext(
      input({
        budget: { budgetCents: null, spentCents: 0, availableCents: null },
        audience: { ...input().audience, pitch: null },
        lastMinute: true,
        previousEdition: null,
      }),
    );
    expect(prompt).toContain('none set: only free or cheap actions, at most €50 each.');
    expect(prompt).toContain('pitch: not filled in');
    expect(prompt).toContain('LAST MINUTE');
    expect(prompt).toContain('No previous edition.');
  });
});
