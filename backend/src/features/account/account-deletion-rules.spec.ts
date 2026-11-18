import { describe, expect, it } from 'vitest';
import { assessDeletion, type MembershipFacts } from './account-deletion-rules.js';

const membership = (overrides: Partial<MembershipFacts>): MembershipFacts => ({
  organizationId: 'org',
  organizationName: 'Jeugdhuis',
  role: 'member',
  memberCount: 3,
  ownerCount: 1,
  eventCount: 0,
  ...overrides,
});

describe('assessDeletion', () => {
  it('blocks on an organization where the user is the only owner of several members', () => {
    const only = membership({ role: 'owner', ownerCount: 1 });
    expect(assessDeletion([only])).toEqual({ blocking: [only], toDelete: [] });
  });

  it('allows it once another owner exists', () => {
    expect(assessDeletion([membership({ role: 'owner', ownerCount: 2 })])).toEqual({
      blocking: [],
      toDelete: [],
    });
  });

  it('reads multi-role strings', () => {
    const only = membership({ role: 'admin,owner', ownerCount: 1 });
    expect(assessDeletion([only]).blocking).toEqual([only]);
  });

  it('never blocks on admins or members', () => {
    expect(
      assessDeletion([membership({ role: 'admin' }), membership({ role: 'member' })]).blocking,
    ).toEqual([]);
  });

  it('deletes organizations where the user is the only member', () => {
    const alone = membership({ role: 'owner', memberCount: 1, ownerCount: 1 });
    expect(assessDeletion([alone])).toEqual({ blocking: [], toDelete: [alone] });
  });
});
