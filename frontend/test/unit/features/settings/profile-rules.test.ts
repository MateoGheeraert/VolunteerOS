import { describe, expect, it } from 'vitest';
import {
  formatPhone,
  isTooYoung,
  isValidPhone,
  missingProfileFields,
} from '@/features/settings/profile-rules';
import { addressFormSchema, EMPTY_ADDRESS, toAddressForm } from '@/features/settings/schemas';

describe('isTooYoung', () => {
  it('turns 13 on the birthday itself', () => {
    expect(isTooYoung('2013-11-19', '2026-11-18')).toBe(true);
    expect(isTooYoung('2013-11-18', '2026-11-18')).toBe(false);
  });
});

describe('phone', () => {
  it('accepts Belgian numbers without a country code and foreign ones with it', () => {
    expect(isValidPhone('0470 12 34 56')).toBe(true);
    expect(isValidPhone('+31 6 12345678')).toBe(true);
    expect(isValidPhone('12')).toBe(false);
  });

  it('shows Belgian numbers the national way, others internationally', () => {
    expect(formatPhone('+32470123456')).toBe('0470 12 34 56');
    expect(formatPhone('+31612345678')).toBe('+31 6 12345678');
  });
});

describe('missingProfileFields', () => {
  it('lists the empty optional fields', () => {
    expect(missingProfileFields({ phone: null, address: null, birthDate: '1990-01-01' })).toEqual([
      'phone',
      'address',
    ]);
  });
});

describe('addressFormSchema', () => {
  const address = {
    ...EMPTY_ADDRESS,
    street: 'Kerkstraat',
    houseNumber: '12',
    postalCode: '8650',
    city: 'Merkem',
  };

  it('needs street, number, postal code and city; the box is optional', () => {
    expect(addressFormSchema.safeParse(address).success).toBe(true);
    expect(addressFormSchema.safeParse({ ...address, city: ' ' }).success).toBe(false);
  });

  it('wants four digits for a Belgian postal code only', () => {
    expect(addressFormSchema.safeParse({ ...address, postalCode: '86500' }).success).toBe(false);
    expect(
      addressFormSchema.safeParse({ ...address, postalCode: '1012 AB', country: 'NL' }).success,
    ).toBe(true);
  });

  it('turns a saved address into form values', () => {
    expect(toAddressForm(null)).toEqual(EMPTY_ADDRESS);
    expect(toAddressForm({ ...address, box: null, country: 'BE' })).toEqual(address);
  });
});
