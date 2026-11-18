import { z } from 'zod';
import type { AddressOutput } from '@/api/generated/types.gen';
import { MIN_PASSWORD_LENGTH } from '@/features/auth/schemas';
import { msg } from '@/i18n/keys';

const required = msg('auth.validation.required');

/** Countries offered for an address; the backend takes any ISO code. Belgium first. */
export const ADDRESS_COUNTRIES = ['BE', 'NL', 'FR', 'DE', 'LU'] as const;
export type AddressCountry = (typeof ADDRESS_COUNTRIES)[number];

/** One inline edit on the profile page: only the fields sent change, null clears one. */
export const profilePatchSchema = z
  .object({
    name: z.string().trim().min(1, required).max(100),
    phone: z.string().trim().max(30).nullable(),
    birthDate: z.iso.date().nullable(),
  })
  .partial();
export type ProfilePatch = z.infer<typeof profilePatchSchema>;

/** The address is saved as a whole: street, number, postal code and city, box optional. */
export const addressFormSchema = z
  .object({
    street: z.string().trim().min(1, required).max(200),
    houseNumber: z.string().trim().min(1, required).max(20),
    box: z.string().trim().max(20),
    postalCode: z.string().trim().min(1, required).max(20),
    city: z.string().trim().min(1, required).max(100),
    country: z.enum(ADDRESS_COUNTRIES),
  })
  .refine((address) => address.country !== 'BE' || /^\d{4}$/.test(address.postalCode), {
    message: msg('settings.address.postalCodeBe'),
    path: ['postalCode'],
  });
export type AddressForm = z.infer<typeof addressFormSchema>;

export const EMPTY_ADDRESS: AddressForm = {
  street: '',
  houseNumber: '',
  box: '',
  postalCode: '',
  city: '',
  country: 'BE',
};

export function toAddressForm(address: AddressOutput | null): AddressForm {
  if (!address) return EMPTY_ADDRESS;
  const country = ADDRESS_COUNTRIES.find((code) => code === address.country) ?? 'BE';
  return { ...address, box: address.box ?? '', country };
}

export const changeEmailSchema = z.object({
  newEmail: z.email(msg('auth.validation.email')),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, required),
  newPassword: z.string().min(MIN_PASSWORD_LENGTH, msg('auth.validation.passwordLength')),
  revokeOtherSessions: z.boolean(),
});
