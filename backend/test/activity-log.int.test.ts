import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { recordActivity } from '../src/activity/activity-log.js';
import { SYSTEM_ACTOR } from '../src/activity/actor.js';
import { activityLog, event, member, type ActivityLogRow } from '../src/db/schema/index.js';
import { EventsRepository } from '../src/features/events/events.repository.js';
import { createTestApp, type TestApp, type TestClient } from './test-app.js';

let t: TestApp;

beforeAll(async () => {
  t = await createTestApp();
});
afterAll(() => t.close());
beforeEach(() => t.reset());

let admin: TestClient;
let adminId: string;
let orgId: string;

beforeEach(async () => {
  admin = t.client();
  adminId = (await admin.signUp('Ada Admin', 'ada@example.com')).id;
  orgId = (await admin.createOrganization('KLJ Merkem')).id;
});

const entries = (where: Partial<Pick<ActivityLogRow, 'entityType' | 'entityId' | 'action'>> = {}) =>
  t.db
    .select()
    .from(activityLog)
    .where(
      and(
        eq(activityLog.organizationId, orgId),
        where.entityType ? eq(activityLog.entityType, where.entityType) : undefined,
        where.entityId ? eq(activityLog.entityId, where.entityId) : undefined,
        where.action ? eq(activityLog.action, where.action) : undefined,
      ),
    );

const memberIdOf = async (userId: string) => {
  const [row] = await t.db
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.organizationId, orgId), eq(member.userId, userId)));
  return row!.id;
};

describe('transactions', () => {
  it('leaves no entry when the write is rolled back', async () => {
    const created = await admin.createEvent();
    const before = await entries();
    const repository = t.app.get(EventsRepository, { strict: false });
    const [current] = await t.db.select().from(event).where(eq(event.id, created.id));

    await expect(
      t.db.transaction(async (tx) => {
        const row = await repository.update(tx, orgId, created.id, { name: 'Rolled back' });
        await recordActivity(
          tx,
          { organizationId: orgId, actor: SYSTEM_ACTOR },
          {
            action: 'updated',
            entityType: 'event',
            entity: row,
            before: current!,
            eventId: row.id,
          },
        );
        throw new Error('fails after the change and its log entry');
      }),
    ).rejects.toThrow('fails after the change');

    expect(await entries()).toHaveLength(before.length);
    expect((await admin.get(`/api/events/${created.id}`)).body.name).toBe('Kerstmarkt 2026');
  });

  it('keeps the entry when the same write commits', async () => {
    const created = await admin.createEvent();
    const repository = t.app.get(EventsRepository, { strict: false });
    const [current] = await t.db.select().from(event).where(eq(event.id, created.id));

    await t.db.transaction(async (tx) => {
      const row = await repository.update(tx, orgId, created.id, { name: 'Committed' });
      await recordActivity(
        tx,
        { organizationId: orgId, actor: SYSTEM_ACTOR },
        {
          action: 'updated',
          entityType: 'event',
          entity: row,
          before: current!,
          eventId: row.id,
          values: ['name'],
        },
      );
    });

    const [entry] = await entries({ entityId: created.id, action: 'updated' });
    expect(entry).toMatchObject({
      actorType: 'system',
      actorId: null,
      changes: { name: { from: 'Kerstmarkt 2026', to: 'Committed' } },
    });
  });
});

describe('events', () => {
  it('logs create, update and archive with who did it and what changed', async () => {
    const created = await admin.createEvent({ location: 'Dorpsplein', description: 'Gezellig' });

    const [createdEntry] = await entries({ entityType: 'event', action: 'created' });
    expect(createdEntry).toMatchObject({
      eventId: created.id,
      entityId: created.id,
      actorType: 'user',
      actorId: adminId,
      changes: {
        name: { to: 'Kerstmarkt 2026' },
        location: { to: 'Dorpsplein' },
        status: { to: 'draft' },
        startsAt: { to: '2026-12-12T13:00:00.000Z' },
        // Free text: whether it was set, never what it says.
        description: null,
      },
    });
    expect(await entries({ entityType: 'event_member', action: 'member_added' })).toEqual([
      expect.objectContaining({
        eventId: created.id,
        changes: expect.objectContaining({ userId: { to: adminId } }),
      }),
    ]);

    await admin.patch(`/api/events/${created.id}`, { name: 'Kerstmarkt', description: 'Anders' });
    const [updated] = await entries({ entityType: 'event', action: 'updated' });
    expect(updated!.changes).toEqual({
      name: { from: 'Kerstmarkt 2026', to: 'Kerstmarkt' },
      description: null,
    });

    await admin.post(`/api/events/${created.id}/archive`);
    const [archived] = await entries({ entityType: 'event', action: 'archived' });
    expect(archived!.changes).toEqual({ status: { from: 'draft', to: 'archived' } });
  });

  it('logs edition links and attendance with values, the retrospective by name', async () => {
    const first = await admin.createEvent({
      name: 'Kerstmarkt 2025',
      startsAt: '2025-12-12T14:00:00+01:00',
      endsAt: '2025-12-12T23:00:00+01:00',
    });
    const second = await admin.createEvent({
      previousEditionId: first.id,
      expectedAttendance: 900,
    });

    const [created] = await entries({ entityId: second.id, action: 'created' });
    expect(created!.changes).toMatchObject({
      eventType: { to: 'market' },
      previousEditionId: { to: first.id },
      expectedAttendance: { to: 900 },
    });

    await admin.patch(`/api/events/${second.id}`, {
      actualAttendance: 1100,
      retrospective: 'Te weinig toiletten.',
    });
    const [updated] = await entries({ entityId: second.id, action: 'updated' });
    expect(updated!.changes).toEqual({
      actualAttendance: { from: null, to: 1100 },
      // Free text: whether it changed, never what it says.
      retrospective: null,
    });
  });

  it('logs nothing for an update that changes nothing', async () => {
    const created = await admin.createEvent();
    const res = await admin.patch(`/api/events/${created.id}`, { name: 'Kerstmarkt 2026' });
    expect(res.status).toBe(200);
    expect(await entries({ action: 'updated' })).toEqual([]);
  });

  it('soft-deletes a manager assignment, and allows assigning them again', async () => {
    const created = await admin.createEvent();
    const { client: mo, user } = await t.inviteMember(admin, orgId, 'Mo Member', 'mo@example.com');

    await admin.post(`/api/events/${created.id}/members`, { userId: user.id });
    // Assigning again with the same role changes nothing, so it isn't logged.
    await admin.post(`/api/events/${created.id}/members`, { userId: user.id });
    expect((await admin.delete(`/api/events/${created.id}/members/${user.id}`)).status).toBe(204);
    // Unassigned: still readable, as every event is to every member, but no longer editable.
    expect((await mo.get(`/api/events/${created.id}`)).status).toBe(200);
    expect((await mo.patch(`/api/events/${created.id}`, { name: 'Mo' })).status).toBe(403);
    expect((await admin.delete(`/api/events/${created.id}/members/${user.id}`)).status).toBe(404);

    expect(
      (await admin.post(`/api/events/${created.id}/members`, { userId: user.id })).status,
    ).toBe(204);
    expect((await mo.patch(`/api/events/${created.id}`, { name: 'Mo' })).status).toBe(200);

    const members = await admin.get(`/api/events/${created.id}/members`);
    expect(members.body.map((m: { userId: string }) => m.userId).sort()).toEqual(
      [adminId, user.id].sort(),
    );

    // The removed assignment is still in the database, and the log tells the whole story.
    const history = (await entries({ entityType: 'event_member' }))
      .filter((e) => e.actorId === adminId)
      .map((e) => e.action);
    expect(history.filter((a) => a === 'member_added')).toHaveLength(3); // creator, Mo twice
    expect(history.filter((a) => a === 'member_removed')).toHaveLength(1);
  });
});

describe('Better Auth', () => {
  it('logs organization creation, with the creator as actor', async () => {
    const [org] = await entries({ entityType: 'organization', action: 'created' });
    expect(org).toMatchObject({
      entityId: orgId,
      eventId: null,
      actorType: 'user',
      actorId: adminId,
      changes: expect.objectContaining({ name: { to: 'KLJ Merkem' } }),
    });
    const [owner] = await entries({ entityType: 'member', action: 'member_added' });
    expect(owner!.changes).toMatchObject({ userId: { to: adminId }, role: { to: 'owner' } });
  });

  it('logs invitations, members and roles, with the acting user', async () => {
    const { user: mo, invitationId } = await t.inviteMember(
      admin,
      orgId,
      'Mo Member',
      'mo@example.com',
    );

    const [invited] = await entries({ entityType: 'invitation', action: 'invited' });
    expect(invited).toMatchObject({
      entityId: invitationId,
      actorId: adminId,
      changes: expect.objectContaining({ email: null, role: { to: 'member' } }),
    });
    const [accepted] = await entries({ entityType: 'invitation', action: 'accepted' });
    expect(accepted).toMatchObject({ entityId: invitationId, actorId: mo.id, changes: null });

    const memberId = await memberIdOf(mo.id);
    expect(await entries({ entityId: memberId, action: 'member_added' })).toEqual([
      expect.objectContaining({ actorId: mo.id }),
    ]);

    const role = await admin.post('/api/auth/organization/update-member-role', {
      memberId,
      role: 'admin',
    });
    expect(role.status).toBe(200);
    const [roleChanged] = await entries({ entityId: memberId, action: 'role_changed' });
    expect(roleChanged).toMatchObject({
      actorId: adminId,
      changes: { role: { from: 'member', to: 'admin' } },
    });

    const removed = await admin.post('/api/auth/organization/remove-member', {
      memberIdOrEmail: memberId,
    });
    expect(removed.status).toBe(200);
    expect(await entries({ entityId: memberId, action: 'member_removed' })).toEqual([
      expect.objectContaining({ actorId: adminId, entityType: 'member' }),
    ]);
  });

  it('logs cancelled invitations and organization updates', async () => {
    const invite = await admin.post('/api/auth/organization/invite-member', {
      email: 'late@example.com',
      role: 'member',
    });
    await admin.post('/api/auth/organization/cancel-invitation', { invitationId: invite.body.id });
    expect(await entries({ entityId: invite.body.id, action: 'cancelled' })).toEqual([
      expect.objectContaining({ actorId: adminId }),
    ]);

    const update = await admin.post('/api/auth/organization/update', {
      data: { name: 'KLJ Merkem-Dorp' },
    });
    expect(update.status).toBe(200);
    const [updated] = await entries({ entityType: 'organization', action: 'updated' });
    expect(updated).toMatchObject({
      actorId: adminId,
      changes: { name: { from: 'KLJ Merkem', to: 'KLJ Merkem-Dorp' } },
    });
  });

  it('does not allow deleting an organization', async () => {
    const res = await admin.post('/api/auth/organization/delete', { organizationId: orgId });
    expect(res.status).not.toBe(200);
  });
});

describe('personal data', () => {
  it('never stores names or email addresses', async () => {
    const created = await admin.createEvent();
    const { user } = await t.inviteMember(admin, orgId, 'Mo Member', 'mo@example.com');
    await admin.post(`/api/events/${created.id}/members`, { userId: user.id });
    await admin.delete(`/api/events/${created.id}/members/${user.id}`);

    const everything = JSON.stringify(await entries());
    for (const personal of ['Ada Admin', 'ada@example.com', 'Mo Member', 'mo@example.com']) {
      expect(everything).not.toContain(personal);
    }
  });
});
