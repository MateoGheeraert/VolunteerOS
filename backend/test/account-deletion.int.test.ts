import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  account,
  activityLog,
  emailDelivery,
  eventMember,
  invitation,
  member,
  organization,
  session,
  task,
  user,
  userProfile,
  verification,
} from '../src/db/schema/index.js';
import { createTestApp, type TestApp, type TestClient } from './test-app.js';

let t: TestApp;

beforeAll(async () => {
  t = await createTestApp();
});
afterAll(() => t.close());
beforeEach(() => t.reset());

const PASSWORD = 'correct-horse-battery';

let olga: TestClient;
let olgaId: string;
let orgId: string;

beforeEach(async () => {
  olga = t.client();
  olgaId = (await olga.signUp('Olga Owner', 'olga@example.com')).id;
  orgId = (await olga.createOrganization('KLJ Merkem')).id;
});

const deleteAccount = (client: TestClient, password = PASSWORD) =>
  client.request('delete', '/api/me', { password });
const check = async (client: TestClient) => {
  const res = await client.get('/api/me/deletion-check');
  expect(res.status).toBe(200);
  return res.body as {
    canDelete: boolean;
    blockingOrganizations: { id: string; name: string }[];
    organizationsToDelete: { id: string; name: string; eventCount: number }[];
  };
};

const memberIdOf = async (userId: string, organizationId = orgId) => {
  const [row] = await t.db
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.organizationId, organizationId), eq(member.userId, userId)));
  return row!.id;
};
const setRole = async (client: TestClient, userId: string, role: string) => {
  const res = await client.post('/api/auth/organization/update-member-role', {
    memberId: await memberIdOf(userId),
    role,
  });
  expect(res.status).toBe(200);
};

async function signIn(email: string, password = PASSWORD) {
  const client = t.client();
  const res = await client.post('/api/auth/sign-in/email', { email, password });
  return { client, status: res.status };
}

describe('confirming', () => {
  it('refuses a wrong password and changes nothing', async () => {
    const res = await deleteAccount(olga, 'not-my-password');
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('password');

    const [row] = await t.db.select().from(user).where(eq(user.id, olgaId));
    expect(row).toMatchObject({ name: 'Olga Owner', email: 'olga@example.com', deletedAt: null });
    expect((await olga.get('/api/me/profile')).status).toBe(200);
  });

  it('needs a session', async () => {
    expect((await deleteAccount(t.client())).status).toBe(401);
  });
});

describe('the last owner', () => {
  it('is blocked while others are members, until someone else is owner too', async () => {
    const { user: mo } = await t.inviteMember(olga, orgId, 'Mo Member', 'mo@example.com');

    expect(await check(olga)).toEqual({
      canDelete: false,
      blockingOrganizations: [{ id: orgId, name: 'KLJ Merkem' }],
      organizationsToDelete: [],
    });
    expect((await deleteAccount(olga)).status).toBe(409);

    // An admin is not enough.
    await setRole(olga, mo.id, 'admin');
    expect((await check(olga)).canDelete).toBe(false);
    expect((await deleteAccount(olga)).status).toBe(409);

    await setRole(olga, mo.id, 'owner');
    expect(await check(olga)).toEqual({
      canDelete: true,
      blockingOrganizations: [],
      organizationsToDelete: [],
    });
    expect((await deleteAccount(olga)).status).toBe(204);

    // The organization lives on with Mo as its owner.
    const [org] = await t.db.select().from(organization).where(eq(organization.id, orgId));
    expect(org!.deletedAt).toBeNull();
    const members = await t.db.select().from(member).where(eq(member.organizationId, orgId));
    expect(members).toEqual([expect.objectContaining({ userId: mo.id, role: 'owner' })]);
  });

  it('does not block admins and members', async () => {
    const { client: mo } = await t.inviteMember(olga, orgId, 'Mo Member', 'mo@example.com');
    expect((await check(mo)).canDelete).toBe(true);
    expect((await deleteAccount(mo)).status).toBe(204);
  });
});

describe('an organization without other members', () => {
  it('is deleted with the account, with its invitations, and stays hidden', async () => {
    await olga.createEvent({ name: 'Kerstmarkt' });
    const pending = await olga.post('/api/auth/organization/invite-member', {
      email: 'late@example.com',
      role: 'member',
    });
    expect(pending.status).toBe(200);

    expect(await check(olga)).toEqual({
      canDelete: true,
      blockingOrganizations: [],
      organizationsToDelete: [{ id: orgId, name: 'KLJ Merkem', eventCount: 1 }],
    });
    expect((await deleteAccount(olga)).status).toBe(204);

    const [org] = await t.db.select().from(organization).where(eq(organization.id, orgId));
    expect(org!.deletedAt).toBeInstanceOf(Date);
    // The slug is free again.
    expect(org!.slug).toBe(`deleted-${orgId}`);
    const [cancelled] = await t.db
      .select()
      .from(invitation)
      .where(eq(invitation.id, pending.body.id));
    expect(cancelled!.status).toBe('canceled');

    // The invitee can't join anymore.
    const late = t.client();
    await late.signUp('Late', 'late@example.com');
    const accept = await late.post('/api/auth/organization/accept-invitation', {
      invitationId: pending.body.id,
    });
    expect(accept.status).toBeGreaterThanOrEqual(400);

    const log = await t.db
      .select({ action: activityLog.action, actorId: activityLog.actorId })
      .from(activityLog)
      .where(eq(activityLog.organizationId, orgId));
    expect(log).toEqual(
      expect.arrayContaining([
        { action: 'cancelled', actorId: olgaId },
        { action: 'member_left', actorId: olgaId },
        { action: 'organization_deleted', actorId: olgaId },
      ]),
    );

    // Even with a member row put back by hand, the organization stays hidden and closed.
    await t.db.insert(member).values({
      id: 'restored-member',
      organizationId: orgId,
      userId: (await t.db.select().from(user).where(eq(user.email, 'late@example.com')))[0]!.id,
      role: 'owner',
      createdAt: new Date(),
    });
    expect((await late.get('/api/auth/organization/list')).body).toEqual([]);
    const fresh = await signIn('late@example.com');
    expect(fresh.status).toBe(200);
    const freshSession = await fresh.client.get('/api/auth/get-session');
    expect(freshSession.body.session.activeOrganizationId).toBeNull();
    await late.post('/api/auth/organization/set-active', { organizationId: orgId });
    expect((await late.get('/api/events')).status).toBe(403);
  });
});

describe('the account', () => {
  it('is anonymized: nothing personal remains and nobody can sign in with it', async () => {
    const patched = await olga.patch('/api/me/profile', {
      phone: '0470 12 34 56',
      birthDate: '1990-05-01',
    });
    expect(patched.status).toBe(200);
    // A pending password reset token.
    expect(
      (await t.client().post('/api/auth/request-password-reset', { email: 'olga@example.com' }))
        .status,
    ).toBe(200);
    expect(
      await t.db.select().from(verification).where(eq(verification.value, olgaId)),
    ).toHaveLength(1);
    const otherDevice = await signIn('olga@example.com');

    expect((await deleteAccount(olga)).status).toBe(204);

    const [row] = await t.db.select().from(user).where(eq(user.id, olgaId));
    expect(row).toMatchObject({
      name: 'Verwijderde gebruiker',
      email: `deleted-${olgaId}@invalid`,
      image: null,
      emailVerified: false,
    });
    expect(row!.deletedAt).toBeInstanceOf(Date);
    expect(await t.db.select().from(userProfile).where(eq(userProfile.userId, olgaId))).toEqual([]);
    expect(await t.db.select().from(session).where(eq(session.userId, olgaId))).toEqual([]);
    expect(await t.db.select().from(account).where(eq(account.userId, olgaId))).toEqual([]);
    expect(await t.db.select().from(verification).where(eq(verification.value, olgaId))).toEqual(
      [],
    );

    // Every session ended, and signing in no longer works, under either address.
    expect((await olga.get('/api/me/profile')).status).toBe(401);
    expect((await otherDevice.client.get('/api/me/profile')).status).toBe(401);
    expect((await signIn('olga@example.com')).status).toBe(401);
    // Refused either way: no password, and Better Auth rejects the address as invalid.
    expect((await signIn(`deleted-${olgaId}@invalid`)).status).toBeGreaterThanOrEqual(400);

    // No reset email to the placeholder address.
    t.emails.reset();
    await t
      .client()
      .post('/api/auth/request-password-reset', { email: `deleted-${olgaId}@invalid` });
    expect(t.emails.sent).toEqual([]);

    // The address is free for a new account.
    const again = t.client();
    const newUser = await again.signUp('Olga', 'olga@example.com');
    expect(newUser.id).not.toBe(olgaId);
  });

  it('logs the deletion without personal values', async () => {
    expect((await deleteAccount(olga)).status).toBe(204);
    const entries = await t.db
      .select()
      .from(activityLog)
      .where(and(eq(activityLog.entityType, 'user'), eq(activityLog.action, 'account_deleted')));
    expect(entries).toEqual([
      expect.objectContaining({
        organizationId: null,
        actorType: 'user',
        actorId: olgaId,
        entityId: olgaId,
        changes: null,
      }),
    ]);
    expect(JSON.stringify(await t.db.select().from(activityLog))).not.toContain('olga@example.com');
  });

  it('sends a goodbye email to the original address, and keeps no copy of it', async () => {
    expect((await deleteAccount(olga)).status).toBe(204);

    const goodbye = t.emails.lastTo('olga@example.com');
    expect(goodbye?.subject).toBe('Je account is verwijderd');
    expect(goodbye?.text).toContain('Olga Owner');
    expect(goodbye?.text).toContain('KLJ Merkem');

    const [delivery] = await t.db
      .select()
      .from(emailDelivery)
      .where(eq(emailDelivery.idempotencyKey, `account-deleted:${olgaId}`));
    expect(delivery).toMatchObject({ status: 'sent', recipient: `deleted-${olgaId}@invalid` });
  });
});

describe('memberships', () => {
  it('end like a removal: tasks are released, assignments end, the user is shown as deleted', async () => {
    const { client: mo, user: moUser } = await t.inviteMember(olga, orgId, 'Mo', 'mo@example.com');
    const event = await olga.createEvent();
    expect((await olga.post(`/api/events/${event.id}/members`, { userId: moUser.id })).status).toBe(
      204,
    );
    const created = await mo.post(`/api/events/${event.id}/tasks`, {
      title: 'Tap reinigen',
      assigneeUserId: moUser.id,
    });
    expect(created.status).toBe(201);

    expect((await deleteAccount(mo)).status).toBe(204);

    const [released] = await t.db.select().from(task).where(eq(task.id, created.body.id));
    expect(released!.assigneeUserId).toBeNull();
    const [assignment] = await t.db
      .select()
      .from(eventMember)
      .where(and(eq(eventMember.eventId, event.id), eq(eventMember.userId, moUser.id)));
    expect(assignment!.deletedAt).toBeInstanceOf(Date);

    const [listed] = (await olga.get(`/api/events/${event.id}/tasks`)).body;
    expect(listed.createdBy).toEqual({
      userId: moUser.id,
      name: 'Verwijderde gebruiker',
      active: false,
    });

    const log = await t.db
      .select({
        action: activityLog.action,
        entityType: activityLog.entityType,
        actorId: activityLog.actorId,
        changes: activityLog.changes,
      })
      .from(activityLog)
      .where(and(eq(activityLog.organizationId, orgId), eq(activityLog.actorId, moUser.id)));
    expect(log).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: 'member_left', entityType: 'member', changes: null }),
        expect.objectContaining({ action: 'member_removed', entityType: 'event_member' }),
        expect.objectContaining({ action: 'updated', entityType: 'task' }),
      ]),
    );
    expect(JSON.stringify(log)).not.toContain('mo@example.com');
  });
});

describe('personal data elsewhere', () => {
  it('is scrubbed from invitations and the delivery log', async () => {
    const other = t.client();
    await other.signUp('Bea', 'bea@example.com');
    const otherOrg = await other.createOrganization('Jeugdhuis');
    // An invitation to Olga, still pending, and one Olga sent.
    const toOlga = await other.post('/api/auth/organization/invite-member', {
      email: 'Olga@Example.com',
      role: 'member',
    });
    expect(toOlga.status).toBe(200);
    const byOlga = await olga.post('/api/auth/organization/invite-member', {
      email: 'friend@example.com',
      role: 'member',
    });
    expect(byOlga.status).toBe(200);

    expect((await deleteAccount(olga)).status).toBe(204);

    const [invited] = await t.db.select().from(invitation).where(eq(invitation.id, toOlga.body.id));
    expect(invited).toMatchObject({ status: 'canceled', email: `deleted-${olgaId}@invalid` });
    const cancelLog = await t.db
      .select()
      .from(activityLog)
      .where(and(eq(activityLog.organizationId, otherOrg.id), eq(activityLog.action, 'cancelled')));
    expect(cancelLog).toHaveLength(1);

    const deliveries = await t.db.select().from(emailDelivery);
    expect(JSON.stringify(deliveries).toLowerCase()).not.toContain('olga@example.com');
    expect(JSON.stringify(deliveries)).not.toContain('Olga Owner');
    const [sent] = deliveries.filter(
      (row) => row.idempotencyKey === `organization-invitation:${byOlga.body.id}`,
    );
    expect(sent!.subject).toBe(
      'Verwijderde gebruiker nodigt je uit voor KLJ Merkem op VolunteerOS',
    );
  });
});
