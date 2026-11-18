import { parsePhoneNumberFromString } from 'libphonenumber-js/max';

/**
 * Pure rules for personal profile fields. The schemas use them to validate input; the
 * frontend mirrors them for instant feedback.
 */

/**
 * Below this age a child can't consent to processing their own data in Belgium (GDPR art. 8 as
 * implemented by the Belgian privacy law), so we don't keep a profile for them.
 */
export const MIN_AGE = 13;

/** Numbers without a country code are read as Belgian. */
export const DEFAULT_PHONE_COUNTRY = 'BE';
export const DEFAULT_ADDRESS_COUNTRY = 'BE';

/** Today's calendar day in Brussels ("2026-11-18"). */
export function todayInBrussels(now = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels' }).format(now);
}

/** Completed years between a birth date and a day, both "YYYY-MM-DD". */
export function ageOn(birthDate: string, day: string): number {
  const [by, bm, bd] = birthDate.split('-').map(Number) as [number, number, number];
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const hadBirthday = m > bm || (m === bm && d >= bd);
  return y - by - (hadBirthday ? 0 : 1);
}

/** Why a birth date is refused, or null when it's fine. */
export function birthDateError(birthDate: string, today: string): string | null {
  if (birthDate > today) return 'Birth date cannot be in the future';
  if (birthDate < '1900-01-01') return 'Birth date must be after 1900';
  if (ageOn(birthDate, today) < MIN_AGE) return `Must be at least ${MIN_AGE} years old`;
  return null;
}

/** The number in E.164 (+32470123456), or null when it isn't a valid phone number. */
export function normalizePhone(input: string): string | null {
  const parsed = parsePhoneNumberFromString(input, DEFAULT_PHONE_COUNTRY);
  return parsed?.isValid() ? parsed.number : null;
}
