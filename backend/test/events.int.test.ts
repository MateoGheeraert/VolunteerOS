import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { TEST_APP_URL } from './env.js';
import { createTestApp, type TestApp, type TestClient } from './test-app.js';

let t: TestApp;

beforeAll(async () => {
  t = await createTestApp();
});
afterAll(() => t.close());
beforeEach(() => t.reset());

const inviteMember = (admin: TestClient, organizationId: string, name: string, email: string) =>
  t.inviteMember(admin, organizationId, name, email);

describe('internal secret', () => {
  it('rejects requests without the secret, including auth routes', async () => {
    const c = t.client();
    expect((await c.request('get', '/api/events', undefined, { secret: '' })).status).toBe(403);
    expect((await c.request('get', '/api/auth/ok', undefined, { secret: '' })).status).toBe(403);
    expect(
      (await c.request('get', '/api/events', undefined, { secret: 'wrong-secret' })).status,
    ).toBe(403);
  });

  it('lets health checks through without it', async () => {
    const res = await t.client().request('get', '/api/health', undefined, { secret: '' });
    expect(res.status).toBe(200);
  });
});

describe('authentication', () => {
  it('answers 401 without a session', async () => {
    expect((await t.client().get('/api/events')).status).toBe(401);
  });

  it('answers 403 when no organization is active', async () => {
    const c = t.client();
    await c.signUp('Lone Wolf', 'lone@example.com');
    expect((await c.get('/api/events')).status).toBe(403);
  });

  it('starts a new session in the organization the user already belongs to', async () => {
    const first = t.client();
    await first.signUp('Returning Rita', 'rita@example.com');
    await first.createOrganization('Chiro Rita');

    const later = t.client();
    const signIn = await later.post('/api/auth/sign-in/email', {
      email: 'rita@example.com',
      password: 'correct-horse-battery',
    });
    expect(signIn.status).toBe(200);
    expect((await later.get('/api/events')).status).toBe(200);
  });

  it('resets a forgotten password through the emailed Next.js link', async () => {
    const c = t.client();
    await c.signUp('Forgetful Fien', 'fien@example.com');

    const ask = await c.post('/api/auth/request-password-reset', {
      email: 'fien@example.com',
      redirectTo: '/reset-password',
    });
    expect(ask.status).toBe(200);

    const link = t.emails
      .lastTo('fien@example.com')
      ?.text.match(/(\S+\/reset-password\?token=\S+)/)?.[1];
    expect(link).toBeDefined();
    const url = new URL(link!);
    expect(url.origin).toBe(new URL(TEST_APP_URL).origin);
    const token = url.searchParams.get('token')!;

    const reset = await c.post('/api/auth/reset-password', {
      token,
      newPassword: 'a-brand-new-password',
    });
    expect(reset.status).toBe(200);

    const signIn = await t.client().post('/api/auth/sign-in/email', {
      email: 'fien@example.com',
      password: 'a-brand-new-password',
    });
    expect(signIn.status).toBe(200);

    // The token is single-use.
    const again = await c.post('/api/auth/reset-password', {
      token,
      newPassword: 'yet-another-one!',
    });
    expect(again.status).toBe(400);
  });
});

describe('events', () => {
  let admin: TestClient;
  let orgId: string;

  beforeEach(async () => {
    admin = t.client();
    await admin.signUp('Ada Admin', 'ada@example.com');
    orgId = (await admin.createOrganization('KLJ Merkem')).id;
  });

  it('creates, reads, updates and archives an event', async () => {
    const created = await admin.createEvent({ location: 'Dorpsplein' });
    expect(created.status).toBe('draft');

    const got = await admin.get(`/api/events/${created.id}`);
    expect(got.status).toBe(200);
    expect(got.body).toMatchObject({ name: 'Kerstmarkt 2026', location: 'Dorpsplein' });
    expect(got.body.startsAt).toBe('2026-12-12T13:00:00.000Z');

    const published = await admin.patch(`/api/events/${created.id}`, { status: 'published' });
    expect(published.status).toBe(200);
    expect(published.body.status).toBe('published');

    const archived = await admin.post(`/api/events/${created.id}/archive`);
    expect(archived.status).toBe(200);
    expect(archived.body.status).toBe('archived');

    const afterArchive = await admin.patch(`/api/events/${created.id}`, { name: 'Changed' });
    expect(afterArchive.status).toBe(409);
  });

  it('assigns the creator as manager', async () => {
    const created = await admin.createEvent();
    const members = await admin.get(`/api/events/${created.id}/members`);
    expect(members.body).toEqual([
      expect.objectContaining({ email: 'ada@example.com', role: 'manager' }),
    ]);
  });

  it('validates the body', async () => {
    const res = await admin.post('/api/events', {
      name: '',
      startsAt: '2026-12-12T23:00:00Z',
      endsAt: '2026-12-12T14:00:00Z',
    });
    expect(res.status).toBe(400);

    const notADate = await admin.post('/api/events', {
      name: 'x',
      startsAt: 'tomorrow',
      endsAt: '2026-12-12T14:00:00Z',
    });
    expect(notADate.status).toBe(400);
  });

  it('rejects a PATCH that puts the end before the stored start', async () => {
    const created = await admin.createEvent();
    const res = await admin.patch(`/api/events/${created.id}`, { endsAt: '2026-01-01T00:00:00Z' });
    expect(res.status).toBe(400);
  });

  it('rejects an invalid status transition', async () => {
    const created = await admin.createEvent();
    const res = await admin.patch(`/api/events/${created.id}`, { status: 'completed' });
    expect(res.status).toBe(409);
  });

  it('answers 404 for a malformed or unknown event id', async () => {
    expect((await admin.get('/api/events/not-a-uuid')).status).toBe(404);
    expect((await admin.get('/api/events/00000000-0000-4000-8000-000000000000')).status).toBe(404);
  });

  describe('organization isolation', () => {
    it('hides one organization’s events from another', async () => {
      const event = await admin.createEvent();

      const other = t.client();
      await other.signUp('Otto Other', 'otto@example.com');
      await other.createOrganization('Chiro Elders');

      expect((await other.get('/api/events')).body).toEqual([]);
      expect((await other.get(`/api/events/${event.id}`)).status).toBe(404);
      expect((await other.patch(`/api/events/${event.id}`, { name: 'Hijacked' })).status).toBe(404);
      expect((await other.post(`/api/events/${event.id}/archive`)).status).toBe(404);
      expect((await other.get(`/api/events/${event.id}/members`)).status).toBe(404);

      const stillThere = await admin.get(`/api/events/${event.id}`);
      expect(stillThere.body.name).toBe('Kerstmarkt 2026');
    });

    it('rejects a session whose active organization the user does not belong to', async () => {
      const other = t.client();
      await other.signUp('Otto Other', 'otto@example.com');
      const res = await other.post('/api/auth/organization/set-active', { organizationId: orgId });
      expect(res.status).not.toBe(200);

      // Even if a session pointed at a foreign organization, OrgGuard re-checks membership.
      await t.db.execute(
        sql`update session set active_organization_id = ${orgId}
            where user_id = (select id from "user" where email = 'otto@example.com')`,
      );
      expect((await other.get('/api/events')).status).toBe(403);
    });
  });

  describe('event managers', () => {
    it('gives a member access only to events they are assigned to', async () => {
      const assigned = await admin.createEvent({ name: 'Barbecue' });
      const unassigned = await admin.createEvent({ name: 'Quiz' });
      const { client: member, user } = await inviteMember(
        admin,
        orgId,
        'Mo Member',
        'mo@example.com',
      );

      // Before assignment: nothing visible.
      expect((await member.get('/api/events')).body).toEqual([]);
      expect((await member.get(`/api/events/${assigned.id}`)).status).toBe(404);

      const add = await admin.post(`/api/events/${assigned.id}/members`, { userId: user.id });
      expect(add.status).toBe(204);

      const list = await member.get('/api/events');
      expect(list.body.map((e: { name: string }) => e.name)).toEqual(['Barbecue']);
      expect((await member.patch(`/api/events/${assigned.id}`, { name: 'BBQ' })).status).toBe(200);
      expect((await member.get(`/api/events/${unassigned.id}`)).status).toBe(404);

      // Managers can't assign other managers.
      expect(
        (await member.post(`/api/events/${assigned.id}/members`, { userId: user.id })).status,
      ).toBe(403);

      // Unassigning removes access again.
      expect((await admin.delete(`/api/events/${assigned.id}/members/${user.id}`)).status).toBe(
        204,
      );
      expect((await member.get(`/api/events/${assigned.id}`)).status).toBe(404);
    });

    it('lets any member create an event, and makes them its manager', async () => {
      const { client: member } = await inviteMember(admin, orgId, 'Mo Member', 'mo@example.com');
      const created = await member.createEvent({ name: 'Eetfestijn' });
      expect((await member.get(`/api/events/${created.id}`)).status).toBe(200);
      expect((await admin.get(`/api/events/${created.id}`)).status).toBe(200);
    });

    it('only assigns users who belong to the organization', async () => {
      const event = await admin.createEvent();
      const outsider = t.client();
      const user = await outsider.signUp('Otto Other', 'otto@example.com');
      const res = await admin.post(`/api/events/${event.id}/members`, { userId: user.id });
      expect(res.status).toBe(400);
    });
  });

  describe('invitations', () => {
    it('cannot be accepted once expired', async () => {
      const invite = await admin.post('/api/auth/organization/invite-member', {
        email: 'late@example.com',
        role: 'member',
      });
      await t.db.execute(
        sql`update invitation set expires_at = now() - interval '1 minute' where id = ${invite.body.id}`,
      );

      const invitee = t.client();
      await invitee.signUp('Late Larry', 'late@example.com');
      const accept = await invitee.post('/api/auth/organization/accept-invitation', {
        invitationId: invite.body.id,
      });
      expect(accept.status).toBeGreaterThanOrEqual(400);
    });

    it('cannot be accepted once revoked', async () => {
      const invite = await admin.post('/api/auth/organization/invite-member', {
        email: 'revoked@example.com',
        role: 'member',
      });
      const cancel = await admin.post('/api/auth/organization/cancel-invitation', {
        invitationId: invite.body.id,
      });
      expect(cancel.status).toBe(200);

      const invitee = t.client();
      await invitee.signUp('Rev Oked', 'revoked@example.com');
      const accept = await invitee.post('/api/auth/organization/accept-invitation', {
        invitationId: invite.body.id,
      });
      expect(accept.status).toBeGreaterThanOrEqual(400);
    });

    it('cannot be accepted by someone with a different email', async () => {
      const invite = await admin.post('/api/auth/organization/invite-member', {
        email: 'intended@example.com',
        role: 'member',
      });
      const wrong = t.client();
      await wrong.signUp('Wrong Person', 'wrong@example.com');
      const accept = await wrong.post('/api/auth/organization/accept-invitation', {
        invitationId: invite.body.id,
      });
      expect(accept.status).toBeGreaterThanOrEqual(400);
    });
  });
});
