import { parsePhoneNumberFromString } from 'libphonenumber-js/min';
import type { MyProfile } from '@/api/generated/types.gen';

/**
 * The profile rules of backend/src/features/profile/profile-rules.ts, mirrored for instant
 * feedback. The backend stays the judge.
 */

/** Must match MIN_AGE in the backend: the Belgian age of digital consent. */
export const MIN_AGE = 13;

/** Completed years between a birth date and a day, both "YYYY-MM-DD". */
export function ageOn(birthDate: string, day: string): number {
  const [by, bm, bd] = birthDate.split('-').map(Number) as [number, number, number];
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const hadBirthday = m > bm || (m === bm && d >= bd);
  return y - by - (hadBirthday ? 0 : 1);
}

export const isTooYoung = (birthDate: string, today: string) => ageOn(birthDate, today) < MIN_AGE;

/** Whether the backend will accept the number (Belgian when it has no country code). */
export function isValidPhone(input: string): boolean {
  return parsePhoneNumberFromString(input, 'BE')?.isValid() ?? false;
}

/** "+32470123456" → "0470 12 34 56" for Belgian numbers, "+31 6 12345678" for others. */
export function formatPhone(e164: string): string {
  const parsed = parsePhoneNumberFromString(e164);
  if (!parsed) return e164;
  return parsed.country === 'BE' ? parsed.formatNational() : parsed.formatInternational();
}

/** Profile fields still empty, to nudge the user to fill them in. */
export function missingProfileFields(
  profile: Pick<MyProfile, 'phone' | 'address' | 'birthDate'>,
): ('phone' | 'address' | 'birthDate')[] {
  return (['phone', 'address', 'birthDate'] as const).filter((field) => profile[field] === null);
}
