import { z } from 'zod';
import { msg } from '@/i18n/keys';

/**
 * The organization's profile, as Better Auth stores it (additional fields on the organization).
 * Better Auth's endpoints are not in openapi.json, so these mirror the backend by hand:
 * the enums in backend/src/db/schema/organization-enums.ts, the rules in
 * backend/src/auth/organization-profile.ts (which has the final say).
 */

export const ORGANIZATION_CATEGORIES = [
  'youth_movement',
  'sports_club',
  'culture',
  'school',
  'neighbourhood',
  'charity',
  'student_association',
  'religious',
  'other',
] as const;
export type OrganizationCategory = (typeof ORGANIZATION_CATEGORIES)[number];

export const ORGANIZATION_LEGAL_FORMS = [
  'de_facto_association',
  'npo',
  'international_npo',
  'foundation',
  'company',
  'other',
] as const;
export type OrganizationLegalForm = (typeof ORGANIZATION_LEGAL_FORMS)[number];

export const MIN_FOUNDING_YEAR = 1000;

/** The Peppol scheme for Belgian enterprise numbers. */
const BELGIAN_PEPPOL_SCHEME = '0208';
export const PEPPOL_ID_PATTERN = /^\d{4}:[^\s:]{1,50}$/;

/**
 * A Belgian enterprise number as its 10 digits, or null when it is not one. Accepts
 * "0123.456.749", "BE 0123 456 749" and old 9-digit numbers. The last two digits are 97 minus the
 * first eight modulo 97.
 */
export function normalizeEnterpriseNumber(input: string): string | null {
  const digits = input.replace(/^\s*BE/i, '').replace(/[\s.-]/g, '');
  if (!/^\d{9,10}$/.test(digits)) return null;
  const number = digits.padStart(10, '0');
  if (!/^[01]/.test(number)) return null;
  const check = 97 - (Number(number.slice(0, 8)) % 97);
  return check === Number(number.slice(8)) ? number : null;
}

/** "0123456749" → "0123.456.749". */
export function formatEnterpriseNumber(digits: string): string {
  return `${digits.slice(0, 4)}.${digits.slice(4, 7)}.${digits.slice(7)}`;
}

/** An absolute http(s) URL, or null. A bare domain ("www.chiro.be") gets https://. */
export function normalizeWebsite(input: string): string | null {
  const trimmed = input.trim();
  const withScheme = /^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (!url.hostname.includes('.') || /\s/.test(trimmed)) return null;
  return withScheme;
}

/**
 * The Peppol id to store when the enterprise number changes from `before` to `after`. Belgian
 * organizations are reachable on Peppol as 0208:<enterprise number>, so an empty Peppol id is
 * filled in from it, and one that was filled in that way follows the number. One the organizer
 * typed themselves is never touched.
 */
export function prefilledPeppolId(
  peppolId: string | null,
  before: string | null,
  after: string | null,
): string | null {
  const derivedBefore = before ? `${BELGIAN_PEPPOL_SCHEME}:${before}` : null;
  if (peppolId && peppolId !== derivedBefore) return peppolId;
  return after ? `${BELGIAN_PEPPOL_SCHEME}:${after}` : null;
}

/** Free text: trimmed, empty means "not filled in". */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, msg('organizationSettings.validation.tooLong'))
    .nullable()
    .transform((value) => value || null);

/**
 * One inline edit on the settings page: only the fields sent change. Values are cleaned up the
 * way the backend stores them (enterprise number as digits, website with a scheme).
 */
export const organizationPatchSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, msg('auth.validation.required'))
      .max(100, msg('organizationSettings.validation.tooLong')),
    category: z.enum(ORGANIZATION_CATEGORIES, { error: msg('onboarding.categoryRequired') }),
    legalForm: z.enum(ORGANIZATION_LEGAL_FORMS, { error: msg('common.invalidField') }).nullable(),
    description: optionalText(5000),
    website: optionalText(200).transform((value, ctx) => {
      if (value === null) return null;
      const url = normalizeWebsite(value);
      if (url === null) {
        ctx.addIssue({ code: 'custom', message: msg('organizationSettings.validation.website') });
      }
      return url;
    }),
    foundingYear: z
      .number(msg('organizationSettings.validation.foundingYear'))
      .int(msg('organizationSettings.validation.foundingYear'))
      .min(MIN_FOUNDING_YEAR, msg('organizationSettings.validation.foundingYear'))
      .refine(
        (year) => year <= new Date().getFullYear(),
        msg('organizationSettings.validation.foundingYearFuture'),
      )
      .nullable(),
    enterpriseNumber: optionalText(30).transform((value, ctx) => {
      if (value === null) return null;
      const digits = normalizeEnterpriseNumber(value);
      if (digits === null) {
        ctx.addIssue({
          code: 'custom',
          message: msg('organizationSettings.validation.enterpriseNumber'),
        });
      }
      return digits;
    }),
    peppolId: optionalText(60).refine(
      (value) => value === null || PEPPOL_ID_PATTERN.test(value),
      msg('organizationSettings.validation.peppolId'),
    ),
    insurerName: optionalText(100),
    insurancePolicyNumber: optionalText(100),
    street: optionalText(200),
    houseNumber: optionalText(20),
    box: optionalText(20),
    postalCode: optionalText(20),
    city: optionalText(100),
    country: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2}$/, msg('organizationSettings.validation.country')),
  })
  .partial();

export type OrganizationPatch = z.input<typeof organizationPatchSchema>;

/** Founding year as typed in an inline field: "" clears it, anything else must be a number. */
export function parseYear(input: string): number | null {
  const trimmed = input.trim();
  return trimmed === '' ? null : Number(trimmed);
}
