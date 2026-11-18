import { z } from 'zod';
import {
  birthDateError,
  DEFAULT_ADDRESS_COUNTRY,
  normalizePhone,
  todayInBrussels,
} from './profile-rules.js';

/**
 * API contracts for a user's personal profile. The table stores the address as flat columns
 * (user_profile); the API groups them as one `address`, which is set or cleared as a whole.
 */

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => value || null);

export const addressSchema = z
  .object({
    street: z.string().trim().min(1).max(200),
    houseNumber: z.string().trim().min(1).max(20),
    box: optionalText(20),
    postalCode: z.string().trim().min(1).max(20),
    city: z.string().trim().min(1).max(100),
    /** ISO 3166-1 alpha-2. */
    country: z
      .string()
      .regex(/^[A-Za-z]{2}$/, 'Must be a two-letter country code')
      .transform((value) => value.toUpperCase())
      .default(DEFAULT_ADDRESS_COUNTRY),
  })
  .refine((address) => address.country !== 'BE' || /^\d{4}$/.test(address.postalCode), {
    message: 'A Belgian postal code has four digits',
    path: ['postalCode'],
  })
  .meta({ id: 'Address' });
export type AddressInput = z.infer<typeof addressSchema>;

/** Any common notation; stored in E.164, numbers without a country code read as Belgian. */
const phoneInput = z
  .string()
  .trim()
  .max(30)
  .transform((value, ctx) => {
    const phone = normalizePhone(value);
    if (!phone) {
      ctx.addIssue({ code: 'custom', message: 'Not a valid phone number' });
      return z.NEVER;
    }
    return phone;
  });

/** A calendar day; refused under the minimum age (see profile-rules.ts). */
const birthDateInput = z.iso.date().superRefine((value, ctx) => {
  const error = birthDateError(value, todayInBrussels());
  if (error) ctx.addIssue({ code: 'custom', message: error });
});

/** A partial update: only the fields sent change; null clears a field. */
export const updateProfileSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    phone: phoneInput.nullable(),
    address: addressSchema.nullable(),
    birthDate: birthDateInput.nullable(),
  })
  .partial()
  .meta({ id: 'UpdateProfile' });
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

const addressOutput = z
  .object({
    street: z.string(),
    houseNumber: z.string(),
    box: z.string().nullable(),
    postalCode: z.string(),
    city: z.string(),
    country: z.string(),
  })
  .meta({ id: 'AddressOutput' });

/** The caller's own account and profile: everything. */
export const myProfileSchema = z
  .object({
    userId: z.string(),
    name: z.string(),
    email: z.string(),
    emailVerified: z.boolean(),
    phone: z.string().nullable(),
    address: addressOutput.nullable(),
    birthDate: z.iso.date().nullable(),
  })
  .meta({ id: 'MyProfile' });
export type MyProfileDto = z.infer<typeof myProfileSchema>;

/**
 * Another user's profile, as far as the caller may see it. A field that is left out is not
 * visible to the caller (null means it is visible, but empty):
 * - `phone`: to anyone sharing an organization with them.
 * - `address`, `birthDate`: only to owners and admins of an organization they share.
 */
export const userProfileSchema = z
  .object({
    userId: z.string(),
    name: z.string(),
    phone: z.string().nullable().optional(),
    address: addressOutput.nullable().optional(),
    birthDate: z.iso.date().nullable().optional(),
  })
  .meta({ id: 'UserProfile' });
export type UserProfileDto = z.infer<typeof userProfileSchema>;
