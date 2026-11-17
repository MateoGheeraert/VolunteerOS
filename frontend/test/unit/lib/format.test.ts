import { describe, expect, it } from 'vitest';
import { brusselsToUtcIso, formatCents, formatEventRange, utcIsoToBrussels } from '@/lib/format';

describe('Brussels time conversion', () => {
  it('converts winter time (UTC+1)', () => {
    expect(brusselsToUtcIso('2026-12-19', '14:00')).toBe('2026-12-19T13:00:00.000Z');
  });

  it('converts summer time (UTC+2)', () => {
    expect(brusselsToUtcIso('2027-07-03', '18:30')).toBe('2027-07-03T16:30:00.000Z');
  });

  it('round-trips through the form fields', () => {
    const iso = brusselsToUtcIso('2027-03-28', '23:15');
    expect(utcIsoToBrussels(iso)).toEqual({ date: '2027-03-28', time: '23:15' });
  });

  it('shows UTC midnight on the right Brussels day', () => {
    expect(utcIsoToBrussels('2026-12-31T23:30:00.000Z')).toEqual({
      date: '2027-01-01',
      time: '00:30',
    });
  });

  it('rejects malformed input', () => {
    expect(() => brusselsToUtcIso('2026-12', '14:00')).toThrow(/Invalid date or time/);
  });
});

describe('formatEventRange', () => {
  it('shows one day with a time range', () => {
    expect(formatEventRange('2026-12-19T13:00:00Z', '2026-12-19T22:00:00Z')).toBe(
      'za 19 dec 2026 · 14:00–23:00',
    );
  });

  it('shows both days when the event crosses midnight', () => {
    expect(formatEventRange('2026-12-19T19:00:00Z', '2026-12-20T01:00:00Z')).toBe(
      'za 19 dec 2026 20:00 – zo 20 dec 2026 02:00',
    );
  });
});

describe('formatCents', () => {
  it('formats euros the Belgian way', () => {
    expect(formatCents(42050).replace(/\s/g, ' ')).toBe('€ 420,50');
  });

  it('refuses fractional cents', () => {
    expect(() => formatCents(10.5)).toThrow(/whole cents/);
  });
});
