import { describe, expect, it } from 'vitest';
import {
  canAccessEvent,
  profileVisibility,
  toOrgRole,
  type EventAction,
  type OrgRole,
} from './policies.js';

const actions: EventAction[] = ['read', 'manage', 'manageMembers'];

describe('canAccessEvent', () => {
  it.each<OrgRole>(['owner', 'admin'])('lets an organization %s do everything', (orgRole) => {
    for (const action of actions) {
      expect(canAccessEvent({ orgRole, eventRole: null }, action)).toBe(true);
    }
  });

  it('lets an assigned manager read and manage, but not assign managers', () => {
    const subject = { orgRole: 'member', eventRole: 'manager' } as const;
    expect(canAccessEvent(subject, 'read')).toBe(true);
    expect(canAccessEvent(subject, 'manage')).toBe(true);
    expect(canAccessEvent(subject, 'manageMembers')).toBe(false);
  });

  it('lets an unassigned member read, but not manage', () => {
    const subject = { orgRole: 'member', eventRole: null } as const;
    expect(canAccessEvent(subject, 'read')).toBe(true);
    expect(canAccessEvent(subject, 'manage')).toBe(false);
    expect(canAccessEvent(subject, 'manageMembers')).toBe(false);
  });
});

describe('toOrgRole', () => {
  it.each([
    ['owner', 'owner'],
    ['admin', 'admin'],
    ['member', 'member'],
    ['member, admin', 'admin'],
    ['something-else', 'member'],
  ])('maps "%s" to %s', (input, expected) => {
    expect(toOrgRole(input)).toBe(expected);
  });
});

describe('profileVisibility', () => {
  it('shows nothing without a shared organization', () => {
    expect(profileVisibility([])).toBeNull();
  });

  it('shows members only the phone', () => {
    expect(profileVisibility(['member'])).toEqual({ personal: false });
  });

  it('shows admins and owners of any shared organization everything', () => {
    expect(profileVisibility(['member', 'admin'])).toEqual({ personal: true });
    expect(profileVisibility(['owner'])).toEqual({ personal: true });
  });
});
