import type { DBFieldAttribute } from '@better-auth/core/db';
import { APIError } from 'better-auth/api';
import { z } from 'zod';
import {
  organizationCategoryEnum,
  organizationLegalFormEnum,
} from '../db/schema/organization-enums.js';

/**
 * The organization's profile: Better Auth's `name` plus our additional fields (see auth.ts).
 * Better Auth only checks their JSON types, so every create and update goes through these rules
 * first (organizationHooks in auth.ts). The frontend mirrors them in
 * frontend/src/features/organizations/profile.ts.
 */

/**
 * Better Auth's `schema.organization.additionalFields`: the columns it reads and writes on the
 * organization row (see db/schema/auth.ts, where the enums are real Postgres enums).
 */
export const organizationAdditionalFields = {
  category: { type: [...organizationCategoryEnum.enumValues], required: true },
  legalForm: { type: [...organizationLegalFormEnum.enumValues], required: false },
  description: { type: 'string', required: false },
  website: { type: 'string', required: false },
  foundingYear: { type: 'number', required: false },
  enterpriseNumber: { type: 'string', required: false },
  peppolId: { type: 'string', required: false },
  insurerName: { type: 'string', required: false },
  insurancePolicyNumber: { type: 'string', required: false },
  street: { type: 'string', required: false },
  houseNumber: { type: 'string', required: false },
  box: { type: 'string', required: false },
  postalCode: { type: 'string', required: false },
  city: { type: 'string', required: false },
  country: { type: 'string', required: false, defaultValue: 'BE' },
} satisfies Record<string, DBFieldAttribute>;

/** The oldest year we accept: Flemish guilds and brass bands go back centuries. */
export const MIN_FOUNDING_YEAR = 1000;

/**
 * A Belgian enterprise number (ondernemingsnummer) as its 10 digits, or null when it is not one.
 * Accepts the usual spellings ("0123.456.749", "BE 0123 456 749") and old 9-digit numbers, which
 * got a leading 0. The last two digits are a check: 97 minus the first eight modulo 97.
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

/**
 * A website as an absolute http(s) URL, or null when it is not one. A bare domain
 * ("www.chiro.be") gets https://.
 */
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
  // A real host has a dot ("chiro.be"), never spaces; "https://chiro" is a typo.
  if (!url.hostname.includes('.') || /\s/.test(trimmed)) return null;
  return withScheme;
}

/** A Peppol participant id: a 4-digit scheme, a colon, the identifier (e.g. 0208:0123456749). */
export const PEPPOL_ID_PATTERN = /^\d{4}:[^\s:]{1,50}$/;

const MAX_DESCRIPTION_LENGTH = 5000;

/** Free text: trimmed, and empty means "not filled in" (null). */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((value) => value || null);

/** Each field on its own, as an inline edit sends it. */
const profileFields = {
  name: z.string().trim().min(1).max(100),
  category: z.enum(organizationCategoryEnum.enumValues),
  legalForm: z.enum(organizationLegalFormEnum.enumValues).nullable(),
  description: optionalText(MAX_DESCRIPTION_LENGTH),
  website: optionalText(200).transform((value, ctx) => {
    if (value === null) return null;
    const url = normalizeWebsite(value);
    if (url === null) ctx.addIssue({ code: 'custom', message: 'must be a http(s) URL' });
    return url;
  }),
  foundingYear: z
    .number()
    .int()
    .min(MIN_FOUNDING_YEAR)
    .refine((year) => year <= new Date().getFullYear(), 'cannot be in the future')
    .nullable(),
  enterpriseNumber: optionalText(30).transform((value, ctx) => {
    if (value === null) return null;
    const digits = normalizeEnterpriseNumber(value);
    if (digits === null)
      ctx.addIssue({ code: 'custom', message: 'is not a valid enterprise number' });
    return digits;
  }),
  peppolId: optionalText(60).refine(
    (value) => value === null || PEPPOL_ID_PATTERN.test(value),
    'must look like scheme:identifier',
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
    .regex(/^[A-Z]{2}$/, 'must be an ISO 3166-1 alpha-2 code'),
};

export type OrganizationProfileField = keyof typeof profileFields;
export const ORGANIZATION_PROFILE_FIELDS = Object.keys(profileFields) as OrganizationProfileField[];

const profileUpdateSchema = z.object(profileFields).partial();
export type OrganizationProfileUpdate = z.infer<typeof profileUpdateSchema>;

/**
 * Validates the profile fields in a create or update body and returns them cleaned up (trimmed,
 * enterprise number as digits, website with a scheme). Other fields are Better Auth's to check.
 * Throws a 400 whose message names the field (`website: must be a http(s) URL`), so the frontend
 * can mark it.
 */
export function parseOrganizationProfile(
  input: Record<string, unknown>,
  { action }: { action: 'create' | 'update' },
): OrganizationProfileUpdate {
  if (action === 'update' && input.slug !== undefined) {
    // The slug is set once at creation; renaming the organization keeps it.
    throw badRequest('slug: cannot be changed');
  }
  if (action === 'create' && input.category === undefined) {
    throw badRequest('category: is required');
  }
  const present = Object.fromEntries(
    ORGANIZATION_PROFILE_FIELDS.filter((field) => input[field] !== undefined).map((field) => [
      field,
      input[field],
    ]),
  );
  const result = profileUpdateSchema.safeParse(present);
  if (!result.success) {
    throw badRequest(
      result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '),
    );
  }
  return result.data;
}

function badRequest(message: string) {
  return new APIError('BAD_REQUEST', { code: 'INVALID_ORGANIZATION_PROFILE', message });
}
