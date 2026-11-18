import { describe, expect, it } from 'vitest';
import { organizationSchema } from '@/features/auth/schemas';
import {
  formatEnterpriseNumber,
  normalizeEnterpriseNumber,
  normalizeWebsite,
  organizationPatchSchema,
  parseYear,
  prefilledPeppolId,
} from '@/features/organizations/profile';

describe('enterprise numbers', () => {
  it('accepts valid numbers in the usual spellings, as 10 digits', () => {
    expect(normalizeEnterpriseNumber('0462.920.226')).toBe('0462920226');
    expect(normalizeEnterpriseNumber('BE 0462 920 226')).toBe('0462920226');
    expect(normalizeEnterpriseNumber('462920226')).toBe('0462920226');
  });

  it('rejects a wrong check digit or format', () => {
    expect(normalizeEnterpriseNumber('0462.920.227')).toBeNull();
    expect(normalizeEnterpriseNumber('2000000042')).toBeNull();
    expect(normalizeEnterpriseNumber('0462')).toBeNull();
  });

  it('formats as 0123.456.789', () => {
    expect(formatEnterpriseNumber('0462920226')).toBe('0462.920.226');
  });
});

describe('prefilledPeppolId', () => {
  it('fills an empty Peppol id from a new enterprise number', () => {
    expect(prefilledPeppolId(null, null, '0462920226')).toBe('0208:0462920226');
  });

  it('follows the enterprise number when it was filled in from it', () => {
    expect(prefilledPeppolId('0208:0462920226', '0462920226', '0202023977')).toBe(
      '0208:0202023977',
    );
    expect(prefilledPeppolId('0208:0462920226', '0462920226', null)).toBeNull();
  });

  it('never touches a Peppol id the organizer chose', () => {
    expect(prefilledPeppolId('9925:BE0462920226', '0462920226', '0202023977')).toBe(
      '9925:BE0462920226',
    );
    expect(prefilledPeppolId('9925:BE0462920226', null, null)).toBe('9925:BE0462920226');
  });

  it('stays empty without an enterprise number', () => {
    expect(prefilledPeppolId(null, null, null)).toBeNull();
  });
});

describe('organizationPatchSchema', () => {
  const message = (patch: object) => {
    const result = organizationPatchSchema.safeParse(patch);
    return result.success ? null : result.error.issues[0]?.message;
  };

  it('cleans up website, enterprise number and empty text', () => {
    expect(
      organizationPatchSchema.parse({
        website: 'www.kljmerkem.be',
        enterpriseNumber: '0462.920.226',
        city: '  ',
        country: 'be',
      }),
    ).toEqual({
      website: 'https://www.kljmerkem.be',
      enterpriseNumber: '0462920226',
      city: null,
      country: 'BE',
    });
  });

  it('rejects invalid websites with a message key', () => {
    expect(normalizeWebsite('ftp://kljmerkem.be')).toBeNull();
    expect(message({ website: 'klj merkem' })).toBe('organizationSettings.validation.website');
  });

  it('accepts founding years up to this year only', () => {
    const thisYear = new Date().getFullYear();
    expect(message({ foundingYear: thisYear })).toBeNull();
    expect(message({ foundingYear: null })).toBeNull();
    expect(message({ foundingYear: thisYear + 1 })).toBe(
      'organizationSettings.validation.foundingYearFuture',
    );
    expect(message({ foundingYear: parseYear('abc') })).toBe(
      'organizationSettings.validation.foundingYear',
    );
    expect(message({ foundingYear: 999 })).toBe('organizationSettings.validation.foundingYear');
    expect(parseYear(' ')).toBeNull();
    expect(parseYear('1953')).toBe(1953);
  });

  it('checks enterprise numbers and Peppol ids', () => {
    expect(message({ enterpriseNumber: '0462920227' })).toBe(
      'organizationSettings.validation.enterpriseNumber',
    );
    expect(message({ peppolId: '0462920226' })).toBe('organizationSettings.validation.peppolId');
    expect(message({ peppolId: '0208:0462920226' })).toBeNull();
  });
});

describe('onboarding', () => {
  it('requires a category', () => {
    expect(organizationSchema.safeParse({ name: 'KLJ Merkem', category: '' }).success).toBe(false);
    expect(
      organizationSchema.safeParse({ name: 'KLJ Merkem', category: 'youth_movement' }).success,
    ).toBe(true);
  });
});
