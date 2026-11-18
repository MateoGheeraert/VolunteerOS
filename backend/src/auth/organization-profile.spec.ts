import { APIError } from 'better-auth/api';
import { describe, expect, it } from 'vitest';
import {
  formatEnterpriseNumber,
  normalizeEnterpriseNumber,
  normalizeWebsite,
  parseOrganizationProfile,
} from './organization-profile.js';

describe('normalizeEnterpriseNumber', () => {
  it('accepts the usual spellings of a valid number', () => {
    for (const input of ['0462920226', '0462.920.226', 'BE 0462 920 226', 'be0462.920.226']) {
      expect(normalizeEnterpriseNumber(input)).toBe('0462920226');
    }
  });

  it('pads an old 9-digit number with a leading 0', () => {
    expect(normalizeEnterpriseNumber('462920226')).toBe('0462920226');
  });

  it('rejects a wrong check digit', () => {
    expect(normalizeEnterpriseNumber('0462920227')).toBeNull();
    expect(normalizeEnterpriseNumber('0462.920.225')).toBeNull();
  });

  it('rejects numbers that do not start with 0 or 1, or have the wrong length', () => {
    // Its check digits are right, but enterprise numbers start with 0 or 1.
    expect(normalizeEnterpriseNumber('2000000042')).toBeNull();
    expect(normalizeEnterpriseNumber('04629202260')).toBeNull();
    expect(normalizeEnterpriseNumber('12345')).toBeNull();
    expect(normalizeEnterpriseNumber('0462a20226')).toBeNull();
  });

  it('accepts a check of 97 (first eight digits divisible by 97)', () => {
    expect(normalizeEnterpriseNumber('0000009797')).toBe('0000009797');
  });
});

describe('formatEnterpriseNumber', () => {
  it('groups the digits as 0123.456.789', () => {
    expect(formatEnterpriseNumber('0462920226')).toBe('0462.920.226');
  });
});

describe('normalizeWebsite', () => {
  it('keeps http(s) URLs and adds https:// to a bare domain', () => {
    expect(normalizeWebsite('https://www.chiro.be/merkem')).toBe('https://www.chiro.be/merkem');
    expect(normalizeWebsite('http://klj.be')).toBe('http://klj.be');
    expect(normalizeWebsite(' www.chiro.be ')).toBe('https://www.chiro.be');
  });

  it('rejects other schemes, hosts without a dot and text', () => {
    expect(normalizeWebsite('ftp://chiro.be')).toBeNull();
    expect(normalizeWebsite('javascript:alert(1)')).toBeNull();
    expect(normalizeWebsite('https://chiro')).toBeNull();
    expect(normalizeWebsite('chiro merkem')).toBeNull();
  });
});

describe('parseOrganizationProfile', () => {
  const parse = (input: Record<string, unknown>, action: 'create' | 'update' = 'update') =>
    parseOrganizationProfile(input, { action });
  const messageOf = (fn: () => unknown) => {
    try {
      fn();
    } catch (error) {
      expect(error).toBeInstanceOf(APIError);
      return (error as APIError).message;
    }
    throw new Error('expected a validation error');
  };

  it('requires a category on create, not on update', () => {
    expect(messageOf(() => parse({ name: 'KLJ' }, 'create'))).toBe('category: is required');
    expect(parse({ name: 'KLJ' })).toEqual({ name: 'KLJ' });
    expect(messageOf(() => parse({ category: 'pub' }, 'create'))).toMatch(/^category: /);
  });

  it('cleans up what it accepts, and leaves out what was not sent', () => {
    expect(
      parse({
        category: 'youth_movement',
        enterpriseNumber: '0462.920.226',
        website: 'klj-merkem.be',
        description: '  ',
        peppolId: '0208:0462920226',
        country: 'nl',
        slug: undefined,
        logo: 'ignored',
      }),
    ).toEqual({
      category: 'youth_movement',
      enterpriseNumber: '0462920226',
      website: 'https://klj-merkem.be',
      description: null,
      peppolId: '0208:0462920226',
      country: 'NL',
    });
  });

  it('accepts founding years up to this year', () => {
    const thisYear = new Date().getFullYear();
    expect(parse({ foundingYear: thisYear })).toEqual({ foundingYear: thisYear });
    expect(parse({ foundingYear: 1923 })).toEqual({ foundingYear: 1923 });
    expect(parse({ foundingYear: null })).toEqual({ foundingYear: null });
    expect(messageOf(() => parse({ foundingYear: thisYear + 1 }))).toMatch(/^foundingYear: /);
    expect(messageOf(() => parse({ foundingYear: 999 }))).toMatch(/^foundingYear: /);
    expect(messageOf(() => parse({ foundingYear: 1923.5 }))).toMatch(/^foundingYear: /);
  });

  it('names the field it rejects', () => {
    expect(messageOf(() => parse({ website: 'not a site' }))).toMatch(/^website: /);
    expect(messageOf(() => parse({ enterpriseNumber: '0462920227' }))).toMatch(
      /^enterpriseNumber: /,
    );
    expect(messageOf(() => parse({ peppolId: '0462920226' }))).toMatch(/^peppolId: /);
    expect(messageOf(() => parse({ country: 'BEL' }))).toMatch(/^country: /);
    expect(messageOf(() => parse({ country: null }))).toMatch(/^country: /);
    expect(messageOf(() => parse({ category: null }))).toMatch(/^category: /);
    expect(messageOf(() => parse({ name: '  ' }))).toMatch(/^name: /);
  });

  it('never changes the slug', () => {
    expect(messageOf(() => parse({ slug: 'other' }))).toBe('slug: cannot be changed');
    expect(parse({ slug: 'klj-merkem', category: 'other' }, 'create')).toEqual({
      category: 'other',
    });
  });
});
