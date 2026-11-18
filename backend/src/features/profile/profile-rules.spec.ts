import { describe, expect, it } from 'vitest';
import { ageOn, birthDateError, normalizePhone, todayInBrussels } from './profile-rules.js';

describe('ageOn', () => {
  it('counts completed years, turning older on the birthday itself', () => {
    expect(ageOn('2013-11-18', '2026-11-17')).toBe(12);
    expect(ageOn('2013-11-18', '2026-11-18')).toBe(13);
    expect(ageOn('2013-02-28', '2026-01-01')).toBe(12);
  });

  it('handles 29 February birthdays', () => {
    expect(ageOn('2012-02-29', '2025-02-28')).toBe(12);
    expect(ageOn('2012-02-29', '2025-03-01')).toBe(13);
  });
});

describe('birthDateError', () => {
  it('accepts someone who is 13 today', () => {
    expect(birthDateError('2013-11-18', '2026-11-18')).toBeNull();
  });

  it('refuses under-13s, future dates and implausible ones', () => {
    expect(birthDateError('2013-11-19', '2026-11-18')).toMatch(/at least 13/);
    expect(birthDateError('2027-01-01', '2026-11-18')).toMatch(/future/);
    expect(birthDateError('1899-12-31', '2026-11-18')).toMatch(/1900/);
  });
});

describe('normalizePhone', () => {
  it('reads numbers without a country code as Belgian', () => {
    expect(normalizePhone('0470 12 34 56')).toBe('+32470123456');
    expect(normalizePhone('051/12.34.56')).toBe('+3251123456');
  });

  it('keeps foreign numbers with their country code', () => {
    expect(normalizePhone('+31 6 12345678')).toBe('+31612345678');
    expect(normalizePhone('0031612345678')).toBe('+31612345678');
  });

  it('refuses what is not a phone number', () => {
    expect(normalizePhone('12')).toBeNull();
    expect(normalizePhone('bel me')).toBeNull();
    expect(normalizePhone('0470 12 34')).toBeNull();
  });
});

describe('todayInBrussels', () => {
  it('uses the Brussels calendar day', () => {
    // 23:30 UTC is already the next day in Brussels.
    expect(todayInBrussels(new Date('2026-11-18T23:30:00Z'))).toBe('2026-11-19');
  });
});
