import { describe, expect, it } from 'vitest';
import { canManageMember, isExpired, roleChangeOptions } from '@/features/members/permissions';

describe('canManageMember', () => {
  it('gives regular members no controls at all', () => {
    for (const role of ['owner', 'admin', 'member'] as const) {
      expect(canManageMember({ role: 'member' }, { role }, 2)).toBe(false);
    }
  });

  it('lets admins manage admins and members, but not owners', () => {
    expect(canManageMember({ role: 'admin' }, { role: 'admin' }, 1)).toBe(true);
    expect(canManageMember({ role: 'admin' }, { role: 'member' }, 1)).toBe(true);
    expect(canManageMember({ role: 'admin' }, { role: 'owner' }, 2)).toBe(false);
  });

  it('lets an owner manage another owner, never the last one', () => {
    expect(canManageMember({ role: 'owner' }, { role: 'owner' }, 2)).toBe(true);
    expect(canManageMember({ role: 'owner' }, { role: 'owner' }, 1)).toBe(false);
  });
});

describe('roleChangeOptions', () => {
  it('offers owner to owners only', () => {
    expect(roleChangeOptions({ role: 'owner' })).toEqual(['owner', 'admin', 'member']);
    expect(roleChangeOptions({ role: 'admin' })).toEqual(['admin', 'member']);
  });
});

describe('isExpired', () => {
  const now = new Date('2026-11-18T12:00:00Z');
  it('is expired from the expiry moment on', () => {
    expect(isExpired({ expiresAt: new Date('2026-11-18T12:00:00Z') }, now)).toBe(true);
    expect(isExpired({ expiresAt: new Date('2026-11-18T12:00:01Z') }, now)).toBe(false);
  });
});
