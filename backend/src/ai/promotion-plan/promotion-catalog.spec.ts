import { describe, expect, it } from 'vitest';
import { promotionAudienceEnum } from '../../db/schema/index.js';
import { CHEAP_ACTION_MAX_CENTS } from '../../features/promotion/promotion-rules.js';
import { PROMO_CATALOG, catalogFor, type CatalogFilter } from './promotion-catalog.js';

const filter = (overrides: Partial<CatalogFilter> = {}): CatalogFilter => ({
  audiences: [],
  sizeBand: null,
  lastMinute: false,
  availableCents: 100_000,
  cheapMaxCents: CHEAP_ACTION_MAX_CENTS,
  excludedKeys: new Set(),
  ...overrides,
});
const keys = (items: { key: string }[]) => items.map((item) => item.key);

describe('PROMO_CATALOG', () => {
  it('holds about 30 actions with unique keys', () => {
    expect(PROMO_CATALOG.length).toBeGreaterThanOrEqual(28);
    expect(new Set(keys([...PROMO_CATALOG])).size).toBe(PROMO_CATALOG.length);
  });

  it('has valid audiences, sizes, costs and a how-to for every action', () => {
    const audiences = new Set<string>(promotionAudienceEnum.enumValues);
    const invalid = PROMO_CATALOG.filter(
      (item) =>
        !item.audiences.every((audience) => audiences.has(audience)) ||
        item.sizes.length === 0 ||
        item.costMinCents > item.costMaxCents ||
        item.howTo.length <= 20 ||
        item.leadWeeks < 0,
    );
    expect(keys(invalid)).toEqual([]);
  });

  it('has the agreed Flemish basics', () => {
    expect(keys([...PROMO_CATALOG])).toEqual(
      expect.arrayContaining([
        'posters-local-shops',
        'flyers-higher-education',
        'lineup-reveal-series',
        'ticket-giveaway-partner',
        'uitinvlaanderen',
        'municipal-magazine',
        'story-takeover',
        'youth-movement-word-of-mouth',
        'whatsapp-chain',
      ]),
    );
  });
});

describe('catalogFor', () => {
  it('keeps actions for the event size only', () => {
    const small = catalogFor(filter({ sizeBand: 'S' }));
    expect(keys(small)).not.toContain('lineup-reveal-series');
    expect(keys(small)).toContain('whatsapp-chain');
  });

  it('keeps actions that reach the audience or everyone, best match first', () => {
    const students = catalogFor(filter({ audiences: ['students', 'young_adults'] }));
    expect(keys(students)).toContain('flyers-higher-education');
    expect(keys(students)).toContain('uitinvlaanderen');
    expect(keys(students)).not.toContain('flyers-schools');
    expect(students[0]!.audiences).toEqual(expect.arrayContaining(['students', 'young_adults']));

    const families = catalogFor(filter({ audiences: ['families', 'young_families'] }));
    expect(keys(families)).toContain('flyers-schools');
    expect(keys(families)).not.toContain('flyers-higher-education');
  });

  it('keeps only last-minute actions under three weeks', () => {
    const late = catalogFor(filter({ lastMinute: true }));
    expect(late.every((item) => item.leadWeeks <= 2)).toBe(true);
    expect(keys(late)).toContain('day-before-reminder');
    expect(keys(late)).not.toContain('municipal-magazine');
  });

  it('keeps only cheap actions without a budget, affordable ones with one', () => {
    const noBudget = catalogFor(filter({ availableCents: null }));
    expect(noBudget.every((item) => item.costMinCents <= CHEAP_ACTION_MAX_CENTS)).toBe(true);
    expect(keys(noBudget)).not.toContain('roadside-banner');

    const tight = catalogFor(filter({ availableCents: 0 }));
    expect(tight.every((item) => item.costMinCents === 0)).toBe(true);
  });

  it('leaves out actions already decided', () => {
    expect(keys(catalogFor(filter({ excludedKeys: new Set(['uitinvlaanderen']) })))).not.toContain(
      'uitinvlaanderen',
    );
  });
});
