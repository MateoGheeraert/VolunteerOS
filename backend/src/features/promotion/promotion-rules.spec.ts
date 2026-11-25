import { describe, expect, it } from 'vitest';
import {
  isPromotionLabel,
  promotionBudget,
  promotionGuard,
  promotionMetric,
  sizeBand,
  type PromotionGuardInput,
} from './promotion-rules.js';

describe('sizeBand', () => {
  it.each([
    [null, null],
    [0, 'S'],
    [299, 'S'],
    [300, 'M'],
    [2000, 'M'],
    [2001, 'L'],
  ] as const)('%s visitors → %s', (attendance, band) => {
    expect(sizeBand(attendance)).toBe(band);
  });
});

describe('isPromotionLabel', () => {
  it('matches "Promotie" whatever the case or spacing', () => {
    expect(isPromotionLabel(' promotie ')).toBe(true);
    expect(isPromotionLabel('PROMOTIE')).toBe(true);
    expect(isPromotionLabel('Promo')).toBe(false);
  });
});

describe('promotionGuard', () => {
  const input = (overrides: Partial<PromotionGuardInput> = {}): PromotionGuardInput => ({
    audiences: ['families'],
    pitch: 'Kerstman en glühwein',
    expectedAttendance: 800,
    today: '2026-11-25',
    eventStartDate: '2026-12-19',
    readOnly: false,
    ...overrides,
  });

  it('is ready with an audience, well before the event', () => {
    expect(promotionGuard(input())).toEqual({
      state: 'ready',
      blockedBy: null,
      missing: [],
      lastMinute: false,
      daysLeft: 24,
    });
  });

  it('is blocked without an audience', () => {
    const guard = promotionGuard(input({ audiences: [] }));
    expect(guard.state).toBe('blocked');
    expect(guard.blockedBy).toBe('audience');
  });

  it('lists the missing pitch and visitor count, but stays ready', () => {
    const guard = promotionGuard(input({ pitch: '  ', expectedAttendance: null }));
    expect(guard.state).toBe('ready');
    expect(guard.missing).toEqual(['pitch', 'expectedAttendance']);
  });

  it('is last-minute under three weeks before the start', () => {
    expect(promotionGuard(input({ eventStartDate: '2026-12-15' })).lastMinute).toBe(true);
    expect(promotionGuard(input({ eventStartDate: '2026-12-16' })).lastMinute).toBe(false);
  });

  it('is disabled from the first day of the event, and on archived events', () => {
    expect(promotionGuard(input({ eventStartDate: '2026-11-25' })).state).toBe('disabled');
    expect(promotionGuard(input({ eventStartDate: '2026-11-01' })).state).toBe('disabled');
    expect(promotionGuard(input({ readOnly: true })).state).toBe('disabled');
  });

  it('is disabled, not blocked, when both apply, and then names no Publiek field', () => {
    const guard = promotionGuard(input({ audiences: [], readOnly: true }));
    expect(guard.state).toBe('disabled');
    expect(guard.blockedBy).toBeNull();
  });
});

describe('promotionBudget', () => {
  it('subtracts the actual cost, else the estimate, of the expenses', () => {
    expect(
      promotionBudget(30000, [
        { type: 'expense', estimatedCents: 12000, actualCents: 13420 },
        { type: 'expense', estimatedCents: 5000, actualCents: null },
        { type: 'income', estimatedCents: 99999, actualCents: null },
      ]),
    ).toEqual({ budgetCents: 30000, spentCents: 18420, availableCents: 11580 });
  });

  it('never goes below zero', () => {
    expect(
      promotionBudget(1000, [{ type: 'expense', estimatedCents: 5000, actualCents: null }])
        .availableCents,
    ).toBe(0);
  });

  it('has nothing available without a budget', () => {
    expect(promotionBudget(null, []).availableCents).toBeNull();
  });
});

describe('promotionMetric', () => {
  it('counts suggested (not closed as stale), accepted and done', () => {
    expect(
      promotionMetric(
        [
          { status: 'pending' },
          { status: 'accepted' },
          { status: 'accepted' },
          { status: 'rejected' },
          { status: 'dismissed_stale' },
        ],
        ['done', 'todo'],
      ),
    ).toEqual({ suggested: 4, accepted: 2, done: 1 });
  });
});
