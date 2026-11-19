import { describe, expect, it } from 'vitest';
import { isWithinCap, startOfMonth } from './ai-usage.service.js';

describe('isWithinCap', () => {
  it('lets on-demand runs use the whole cap', () => {
    expect(isWithinCap(999_999, 1000, 'on_demand')).toBe(true);
    expect(isWithinCap(1_000_000, 1000, 'on_demand')).toBe(false);
  });

  it('stops triggered runs at 80% of the cap', () => {
    expect(isWithinCap(799_999, 1000, 'event_created')).toBe(true);
    expect(isWithinCap(800_000, 1000, 'event_created')).toBe(false);
    expect(isWithinCap(800_000, 1000, 'question_answered')).toBe(false);
  });

  it('allows nothing with a zero cap', () => {
    expect(isWithinCap(0, 0, 'on_demand')).toBe(false);
  });
});

describe('startOfMonth', () => {
  it('is midnight on the first in Brussels (winter time)', () => {
    expect(startOfMonth(new Date('2026-11-19T10:00:00Z')).toISOString()).toBe(
      '2026-10-31T23:00:00.000Z',
    );
  });

  it('is midnight on the first in Brussels (summer time)', () => {
    expect(startOfMonth(new Date('2026-07-15T10:00:00Z')).toISOString()).toBe(
      '2026-06-30T22:00:00.000Z',
    );
  });

  it('already counts the new month just after midnight in Brussels', () => {
    // 23:30 UTC on 30 Nov is 00:30 on 1 Dec in Brussels.
    expect(startOfMonth(new Date('2026-11-30T23:30:00Z')).toISOString()).toBe(
      '2026-11-30T23:00:00.000Z',
    );
  });
});
