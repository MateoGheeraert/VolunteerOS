import { and, eq, isNotNull } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { activityLog, eventMember, member } from '../src/db/schema/index.js';
import { createTestApp, type TestApp, type TestClient } from './test-app.js';

let t: TestApp;

beforeAll(async () => {
  t = await createTestApp();
});
afterAll(() => t.close());
beforeEach(() => t.reset());

let owner: TestClient;
let ownerId: string;
let orgId: string;

beforeEach(async () => {
  owner = t.client();
  ownerId = (await owner.signUp('Olga Owner', 'olga@example.com')).id;
  orgId = (await owner.createOrganization('KLJ Merkem')).id;
});

const memberIdOf = async (userId: string) => {
  const [row] = await t.db
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.organizationId, orgId), eq(member.userId, userId)));
  return row!.id;
};

const invite = (client: TestClient, email: string, role = 'member', extra: object = {}) =>
  client.post('/api/auth/organization/invite-member', { email, role, ...extra });
const setRole = (client: TestClient, memberId: string, role: string) =>
  client.post('/api/auth/organization/update-member-role', { memberId, role });
const remove = (client: TestClient, memberId: string) =>
  client.post('/api/auth/organization/remove-member', { memberIdOrEmail: memberId });

/** A member promoted to admin by the owner. */
async function joinAsAdmin(name: string, email: string) {
  const joined = await t.inviteMember(owner, orgId, name, email);
  const memberId = await memberIdOf(joined.user.id);
  expect((await setRole(owner, memberId, 'admin')).status).toBe(200);
  return { ...joined, memberId };
}

describe('regular members', () => {
  it('see the members, but cannot change anything or see invitations', async () => {
    const { client: mo } = await t.inviteMember(owner, orgId, 'Mo Member', 'mo@example.com');
    const pending = await invite(owner, 'pending@example.com');
    const ownerMemberId = await memberIdOf(ownerId);

    const list = await mo.get('/api/auth/organization/list-members');
    expect(list.status).toBe(200);
    expect(list.body.members).toHaveLength(2);

    expect((await mo.get('/api/auth/organization/list-invitations')).status).toBe(403);
    expect((await invite(mo, 'friend@example.com')).status).toBe(403);
    expect(
      (
        await mo.post('/api/auth/organization/cancel-invitation', {
          invitationId: pending.body.id,
        })
      ).status,
    ).toBe(403);
    expect((await setRole(mo, ownerMemberId, 'member')).status).toBeGreaterThanOrEqual(400);
    expect((await remove(mo, ownerMemberId)).status).toBeGreaterThanOrEqual(400);
  });
});

describe('invitations', () => {
  it('can make someone an admin straight away, but never an owner', async () => {
    const asAdmin = await invite(owner, 'new-admin@example.com', 'admin');
    expect(asAdmin.status).toBe(200);
    expect(asAdmin.body.role).toBe('admin');

    expect((await invite(owner, 'new-owner@example.com', 'owner')).status).toBe(400);
    expect((await invite(owner, 'multi@example.com', 'member,admin')).status).toBe(400);
  });

  it('refuses to invite an existing member', async () => {
    await t.inviteMember(owner, orgId, 'Mo Member', 'mo@example.com');
    expect((await invite(owner, 'mo@example.com')).status).toBe(400);
  });

  it('resends by inviting again: the old link stops working, the new one works', async () => {
    const first = await invite(owner, 'late@example.com');
    const second = await invite(owner, 'late@example.com');
    expect(second.status).toBe(200);
    expect(second.body.id).not.toBe(first.body.id);
    expect(t.emails.lastTo('late@example.com')?.text).toContain(`/invitations/${second.body.id}`);

    const invitee = t.client();
    await invitee.signUp('Late Larry', 'late@example.com');
    const stale = await invitee.post('/api/auth/organization/accept-invitation', {
      invitationId: first.body.id,
    });
    expect(stale.status).toBeGreaterThanOrEqual(400);
    const fresh = await invitee.post('/api/auth/organization/accept-invitation', {
      invitationId: second.body.id,
    });
    expect(fresh.status).toBe(200);
  });

  it('rejects the resend flag, which would skip the activity log', async () => {
    await invite(owner, 'late@example.com');
    const res = await invite(owner, 'late@example.com', 'member', { resend: true });
    expect(res.status).toBe(400);
  });
});

describe('roles', () => {
  it('changes roles between admin and member, never to an unknown or combined role', async () => {
    const { user } = await t.inviteMember(owner, orgId, 'Mo Member', 'mo@example.com');
    const memberId = await memberIdOf(user.id);

    expect((await setRole(owner, memberId, 'admin')).status).toBe(200);
    expect((await setRole(owner, memberId, 'member')).status).toBe(200);
    expect((await setRole(owner, memberId, 'owner,admin')).status).toBe(400);
  });

  it('lets an owner make someone else owner, and stay owner too', async () => {
    const { user } = await t.inviteMember(owner, orgId, 'Mo Member', 'mo@example.com');
    const memberId = await memberIdOf(user.id);

    expect((await setRole(owner, memberId, 'owner')).status).toBe(200);
    const roles = await t.db
      .select({ userId: member.userId, role: member.role })
      .from(member)
      .where(eq(member.organizationId, orgId));
    expect(roles).toEqual(
      expect.arrayContaining([
        { userId: ownerId, role: 'owner' },
        { userId: user.id, role: 'owner' },
      ]),
    );
    // With two owners, one may step down.
    expect((await setRole(owner, await memberIdOf(ownerId), 'admin')).status).toBe(200);
  });

  it('never lets a non-owner make someone owner', async () => {
    const ann = await joinAsAdmin('Ann Admin', 'ann@example.com');
    const { client: mo, user } = await t.inviteMember(owner, orgId, 'Mo Member', 'mo@example.com');
    const moMemberId = await memberIdOf(user.id);

    expect((await setRole(ann.client, moMemberId, 'owner')).status).toBe(403);
    expect((await setRole(ann.client, ann.memberId, 'owner')).status).toBe(403);
    expect((await setRole(mo, moMemberId, 'owner')).status).toBeGreaterThanOrEqual(400);
  });

  it('lets admins demote and remove other admins, and themselves', async () => {
    const ann = await joinAsAdmin('Ann Admin', 'ann@example.com');
    const bob = await joinAsAdmin('Bob Admin', 'bob@example.com');

    expect((await setRole(ann.client, bob.memberId, 'member')).status).toBe(200);
    expect((await remove(ann.client, bob.memberId)).status).toBe(200);
    expect((await setRole(ann.client, ann.memberId, 'member')).status).toBe(200);
    // Demoted: the controls are gone.
    expect((await invite(ann.client, 'x@example.com')).status).toBe(403);
  });

  it('protects owners from admins, and keeps the last owner', async () => {
    const ann = await joinAsAdmin('Ann Admin', 'ann@example.com');
    const ownerMemberId = await memberIdOf(ownerId);

    expect((await setRole(ann.client, ownerMemberId, 'member')).status).toBe(403);
    expect((await remove(ann.client, ownerMemberId)).status).toBe(400);

    expect((await setRole(owner, ownerMemberId, 'admin')).status).toBe(400);
    expect((await remove(owner, ownerMemberId)).status).toBe(400);
  });

  it('keeps a second owner out of reach of admins', async () => {
    const ann = await joinAsAdmin('Ann Admin', 'ann@example.com');
    const { user } = await t.inviteMember(owner, orgId, 'Mo Member', 'mo@example.com');
    const moMemberId = await memberIdOf(user.id);
    expect((await setRole(owner, moMemberId, 'owner')).status).toBe(200);

    expect((await setRole(ann.client, moMemberId, 'admin')).status).toBe(403);
    expect((await remove(ann.client, moMemberId)).status).toBe(400);
  });
});

describe('removing a member', () => {
  it('ends their event assignments and logs it', async () => {
    const { client: mo, user } = await t.inviteMember(owner, orgId, 'Mo Member', 'mo@example.com');
    const managed = await mo.createEvent({ name: 'Eetfestijn' });
    const assigned = await owner.createEvent({ name: 'Barbecue' });
    expect(
      (await owner.post(`/api/events/${assigned.id}/members`, { userId: user.id })).status,
    ).toBe(204);

    expect((await remove(owner, await memberIdOf(user.id))).status).toBe(200);

    const ended = await t.db
      .select()
      .from(eventMember)
      .where(and(eq(eventMember.userId, user.id), isNotNull(eventMember.deletedAt)));
    expect(new Set(ended.map((row) => row.eventId))).toEqual(new Set([managed.id, assigned.id]));
    expect((await owner.get(`/api/events/${assigned.id}/members`)).body).toEqual([
      expect.objectContaining({ userId: ownerId }),
    ]);

    const logged = await t.db
      .select()
      .from(activityLog)
      .where(
        and(eq(activityLog.entityType, 'event_member'), eq(activityLog.action, 'member_removed')),
      );
    expect(logged).toHaveLength(2);
    expect(new Set(logged.map((entry) => entry.eventId))).toEqual(
      new Set([managed.id, assigned.id]),
    );
    expect(logged.every((entry) => entry.actorId === ownerId)).toBe(true);
  });

  it('locks them out of the organization at once', async () => {
    const { client: mo, user } = await t.inviteMember(owner, orgId, 'Mo Member', 'mo@example.com');
    expect((await mo.get('/api/events')).status).toBe(200);

    await remove(owner, await memberIdOf(user.id));

    expect((await mo.get('/api/events')).status).toBe(403);
    expect((await mo.get('/api/auth/organization/list-members')).status).toBe(403);
  });
});
