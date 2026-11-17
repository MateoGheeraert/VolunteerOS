import { describe, expect, it } from 'vitest';
import { diff } from './activity-log.js';

const row = {
  id: 'e1',
  organizationId: 'o1',
  name: 'Kerstmarkt',
  description: 'Gezellig',
  startsAt: new Date('2026-12-12T13:00:00Z'),
  updatedAt: new Date('2026-11-01T00:00:00Z'),
};

describe('diff', () => {
  it('stores values only for listed fields, names for the rest', () => {
    const after = { ...row, name: 'Kerstmarkt 2026', description: 'Anders' };
    expect(diff(row, after, ['name'])).toEqual({
      name: { from: 'Kerstmarkt', to: 'Kerstmarkt 2026' },
      description: null,
    });
  });

  it('logs no values when no fields are listed', () => {
    expect(diff(row, { ...row, name: 'X' })).toEqual({ name: null });
  });

  it('compares dates by value and serializes them as ISO strings', () => {
    const same = { ...row, startsAt: new Date(row.startsAt) };
    expect(diff(row, same, ['startsAt'])).toEqual({});

    const later = { ...row, startsAt: new Date('2026-12-13T13:00:00Z') };
    expect(diff(row, later, ['startsAt'])).toEqual({
      startsAt: { from: '2026-12-12T13:00:00.000Z', to: '2026-12-13T13:00:00.000Z' },
    });
  });

  it('ignores ids and timestamps', () => {
    expect(diff(row, { ...row, updatedAt: new Date() })).toEqual({});
  });

  it('lists every set field of a new row, without a `from`', () => {
    expect(diff(null, { ...row, description: null }, ['name', 'startsAt'])).toEqual({
      name: { to: 'Kerstmarkt' },
      startsAt: { to: '2026-12-12T13:00:00.000Z' },
    });
  });
});
