import { describe, expect, it } from 'vitest';
import { safeNextPath, slugify } from '@/lib/navigation';

describe('safeNextPath', () => {
  it('keeps same-site paths', () => {
    expect(safeNextPath('/invitations/abc')).toBe('/invitations/abc');
  });

  it.each(['https://evil.example', '//evil.example', '/\\evil.example', 'events', '', null])(
    'falls back for %s',
    (next) => {
      expect(safeNextPath(next)).toBe('/events');
    },
  );
});

describe('slugify', () => {
  it('makes a url-safe slug', () => {
    expect(slugify('KLJ Merkem!')).toBe('klj-merkem');
  });

  it('drops accents', () => {
    expect(slugify('Chiro Sint-Jozef Ééklo')).toBe('chiro-sint-jozef-eeklo');
  });

  it('never returns an empty slug', () => {
    expect(slugify('!!!')).toBe('organisatie');
  });
});
