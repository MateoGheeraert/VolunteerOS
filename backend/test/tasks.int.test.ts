import { and, asc, eq, isNotNull } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { activityLog, member, task, taskAssignmentRequest } from '../src/db/schema/index.js';
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
let eventId: string;

beforeEach(async () => {
  admin = t.client();
  adminId = (await admin.signUp('Ada Admin', 'ada@example.com')).id;
  orgId = (await admin.createOrganization('KLJ Merkem')).id;
  eventId = (await admin.createEvent()).id;
});

const tasksUrl = (event = eventId) => `/api/events/${event}/tasks`;
const labelsUrl = (event = eventId) => `/api/events/${event}/labels`;

async function createTask(client: TestClient, body: Record<string, unknown> = {}, event = eventId) {
  const res = await client.post(tasksUrl(event), { title: 'Tap reinigen', ...body });
  if (res.status !== 201) throw new Error(`create task failed: ${res.status} ${res.text}`);
  return res.body as { id: string; status: string; assignee: unknown };
}

async function createLabel(name: string, color = 'blue', event = eventId) {
  const res = await admin.post(labelsUrl(event), { name, color });
  if (res.status !== 201) throw new Error(`create label failed: ${res.status} ${res.text}`);
  return res.body as { id: string; name: string };
}

const titles = (res: { body: { title: string }[] }) => res.body.map((x) => x.title).sort();

const logOf = (entityType: string, entityId: string) =>
  t.db
    .select()
    .from(activityLog)
    .where(and(eq(activityLog.entityType, entityType), eq(activityLog.entityId, entityId)))
    .orderBy(asc(activityLog.createdAt));

describe('tasks', () => {
  it('creates a task with defaults, its creator and labels, and logs it', async () => {
    const bar = await createLabel('Bar');
    const created = await admin.post(tasksUrl(), {
      title: '  Tap reinigen  ',
      description: 'Voor de opening',
      dueDate: '2026-12-01',
      labelIds: [bar.id],
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      eventId,
      title: 'Tap reinigen',
      status: 'todo',
      priority: 'medium',
      dueDate: '2026-12-01',
      assignee: null,
      createdBy: { userId: adminId, name: 'Ada Admin', active: true },
      labelIds: [bar.id],
      pendingRequests: [],
    });

    const [entry] = await logOf('task', created.body.id);
    expect(entry).toMatchObject({ action: 'created', eventId, actorId: adminId });
    expect(entry!.changes).toMatchObject({
      title: null,
      description: null,
      status: { to: 'todo' },
      dueDate: { to: '2026-12-01' },
      createdByUserId: { to: adminId },
      labelIds: { to: [bar.id] },
    });
  });

  it('assigns a member or a typed-in name, never both', async () => {
    const { user: mo } = await t.inviteMember(admin, orgId, 'Mo Member', 'mo@example.com');

    const toMember = await createTask(admin, { assigneeUserId: mo.id });
    expect(toMember.assignee).toEqual({
      type: 'member',
      userId: mo.id,
      name: 'Mo Member',
      active: true,
    });
    const toName = await createTask(admin, { assigneeName: 'Bakker Jan' });
    expect(toName.assignee).toEqual({ type: 'external', name: 'Bakker Jan' });

    // Switching kind clears the other field.
    const switched = await admin.patch(`${tasksUrl()}/${toName.id}`, { assigneeUserId: mo.id });
    expect(switched.body.assignee).toMatchObject({ type: 'member', userId: mo.id });

    const both = await admin.post(tasksUrl(), {
      title: 'x',
      assigneeUserId: mo.id,
      assigneeName: 'Jan',
    });
    expect(both.status).toBe(400);
    const stranger = await admin.post(tasksUrl(), { title: 'x', assigneeUserId: 'nobody' });
    expect(stranger.status).toBe(400);
  });

  it('validates the fields', async () => {
    const bad = [
      { title: '   ' },
      { title: 'x'.repeat(201) },
      { title: 'x', description: 'x'.repeat(5001) },
      { title: 'x', dueDate: '2026-12-01T10:00:00Z' },
      { title: 'x', status: 'blocked' },
      { title: 'x', priority: 'urgent' },
      { title: 'x', labelIds: ['not-a-uuid'] },
    ];
    for (const body of bad) {
      const res = await admin.post(tasksUrl(), body);
      expect({ body, status: res.status }).toEqual({ body, status: 400 });
    }
  });

  it('sorts by priority, then due date, then creation', async () => {
    await createTask(admin, { title: 'low', priority: 'low' });
    await createTask(admin, { title: 'medium, no date' });
    await createTask(admin, { title: 'medium, late', dueDate: '2026-12-10' });
    await createTask(admin, { title: 'medium, early', dueDate: '2026-12-01' });
    await createTask(admin, { title: 'high', priority: 'high' });

    const list = await admin.get(tasksUrl());
    expect(list.body.map((x: { title: string }) => x.title)).toEqual([
      'high',
      'medium, early',
      'medium, late',
      'medium, no date',
      'low',
    ]);
  });

  it('updates a task and logs only what changed', async () => {
    const created = await createTask(admin);
    const res = await admin.patch(`${tasksUrl()}/${created.id}`, {
      status: 'in_progress',
      title: 'Tap ontkalken',
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'in_progress', title: 'Tap ontkalken' });

    const entries = await logOf('task', created.id);
    expect(entries.map((e) => e.action)).toEqual(['created', 'updated']);
    expect(entries[1]!.changes).toEqual({
      title: null,
      status: { from: 'todo', to: 'in_progress' },
    });

    // An update that changes nothing logs nothing.
    await admin.patch(`${tasksUrl()}/${created.id}`, { status: 'in_progress' });
    expect(await logOf('task', created.id)).toHaveLength(2);
  });

  it('soft-deletes a task and logs it', async () => {
    const created = await createTask(admin);
    expect((await admin.delete(`${tasksUrl()}/${created.id}`)).status).toBe(204);

    expect((await admin.get(tasksUrl())).body).toEqual([]);
    expect((await admin.patch(`${tasksUrl()}/${created.id}`, { title: 'x' })).status).toBe(404);
    const [row] = await t.db.select().from(task).where(eq(task.id, created.id));
    expect(row!.deletedAt).not.toBeNull();
    expect((await logOf('task', created.id)).map((e) => e.action)).toEqual(['created', 'deleted']);
  });

  it('rejects task writes on an archived event, but still lists its tasks', async () => {
    const created = await createTask(admin);
    await admin.post(`/api/events/${eventId}/archive`);

    expect((await admin.post(tasksUrl(), { title: 'x' })).status).toBe(409);
    expect((await admin.patch(`${tasksUrl()}/${created.id}`, { title: 'x' })).status).toBe(409);
    expect((await admin.delete(`${tasksUrl()}/${created.id}`)).status).toBe(409);
    expect((await admin.post(labelsUrl(), { name: 'Bar' })).status).toBe(409);
    expect((await admin.get(tasksUrl())).body).toHaveLength(1);
  });

  it('allows task edits on a completed event', async () => {
    const created = await createTask(admin);
    await admin.patch(`/api/events/${eventId}`, { status: 'published' });
    await admin.patch(`/api/events/${eventId}`, { status: 'completed' });
    expect((await admin.patch(`${tasksUrl()}/${created.id}`, { status: 'done' })).status).toBe(200);
  });
});

describe('organization isolation', () => {
  it('answers 404 for another organization’s tasks and labels', async () => {
    const created = await createTask(admin);
    const label = await createLabel('Bar');

    const other = t.client();
    await other.signUp('Otto Other', 'otto@example.com');
    await other.createOrganization('Chiro Elders');

    expect((await other.get(tasksUrl())).status).toBe(404);
    expect((await other.post(tasksUrl(), { title: 'Hijacked' })).status).toBe(404);
    expect((await other.patch(`${tasksUrl()}/${created.id}`, { title: 'x' })).status).toBe(404);
    expect((await other.delete(`${tasksUrl()}/${created.id}`)).status).toBe(404);
    expect((await other.post(`${tasksUrl()}/${created.id}/requests`)).status).toBe(404);
    expect((await other.get(labelsUrl())).status).toBe(404);
    expect((await other.patch(`${labelsUrl()}/${label.id}`, { name: 'x' })).status).toBe(404);
    expect((await other.delete(`${labelsUrl()}/${label.id}`)).status).toBe(404);

    const stillThere = await admin.get(tasksUrl());
    expect(stillThere.body[0]).toMatchObject({ id: created.id, title: 'Tap reinigen' });
  });

  it('only reaches a task through the event it belongs to', async () => {
    const created = await createTask(admin);
    const otherEvent = await admin.createEvent({ name: 'Quiz' });
    const otherLabel = await createLabel('Bar', 'blue', otherEvent.id);

    expect((await admin.get(tasksUrl(otherEvent.id))).body).toEqual([]);
    expect(
      (await admin.patch(`${tasksUrl(otherEvent.id)}/${created.id}`, { title: 'x' })).status,
    ).toBe(404);
    expect((await admin.delete(`${tasksUrl(otherEvent.id)}/${created.id}`)).status).toBe(404);
    // Labels belong to one event too.
    const res = await admin.patch(`${tasksUrl()}/${created.id}`, { labelIds: [otherLabel.id] });
    expect(res.status).toBe(400);
  });

  it('answers 404 for malformed ids', async () => {
    expect((await admin.patch(`${tasksUrl()}/not-a-uuid`, { title: 'x' })).status).toBe(404);
    expect((await admin.get(tasksUrl('not-a-uuid'))).status).toBe(404);
  });
});

describe('members', () => {
  let mo: TestClient;
  let moId: string;

  beforeEach(async () => {
    const joined = await t.inviteMember(admin, orgId, 'Mo Member', 'mo@example.com');
    mo = joined.client;
    moId = joined.user.id;
  });

  it('see their own and the unassigned tasks only', async () => {
    const { user: lia } = await t.inviteMember(admin, orgId, 'Lia', 'lia@example.com');
    await createTask(admin, { title: 'mine', assigneeUserId: moId });
    await createTask(admin, { title: 'open' });
    const hidden = await createTask(admin, { title: 'lia’s', assigneeUserId: lia.id });
    await createTask(admin, { title: 'external', assigneeName: 'Bakker Jan' });

    expect(titles(await mo.get(tasksUrl()))).toEqual(['mine', 'open']);
    expect(titles(await admin.get(tasksUrl()))).toHaveLength(4);
    // Hidden tasks don't exist for them.
    expect((await mo.patch(`${tasksUrl()}/${hidden.id}`, { status: 'done' })).status).toBe(404);
  });

  it('change the status of their own task, or give it back, and nothing else', async () => {
    const mine = await createTask(admin, { assigneeUserId: moId });
    const open = await createTask(admin);
    const url = `${tasksUrl()}/${mine.id}`;

    expect((await mo.patch(url, { status: 'in_progress' })).status).toBe(200);
    expect((await mo.patch(url, { title: 'x' })).status).toBe(403);
    expect((await mo.patch(url, { priority: 'high' })).status).toBe(403);
    expect((await mo.patch(`${tasksUrl()}/${open.id}`, { status: 'done' })).status).toBe(403);
    expect((await mo.post(tasksUrl(), { title: 'x' })).status).toBe(403);
    expect((await mo.delete(url)).status).toBe(403);
    expect((await mo.post(labelsUrl(), { name: 'Bar' })).status).toBe(403);

    const givenBack = await mo.patch(url, { assigneeUserId: null });
    expect(givenBack.status).toBe(200);
    expect(givenBack.body.assignee).toBeNull();
    const [entry] = (await logOf('task', mine.id)).slice(-1);
    expect(entry!.changes).toEqual({ assigneeUserId: { from: moId, to: null } });
  });

  it('get full rights on events they manage', async () => {
    await admin.post(`/api/events/${eventId}/members`, { userId: moId });
    const created = await createTask(mo, { title: 'by manager', assigneeName: 'Jan' });
    expect((await mo.get(tasksUrl())).body).toHaveLength(1);
    expect((await mo.patch(`${tasksUrl()}/${created.id}`, { priority: 'high' })).status).toBe(200);
    expect((await mo.post(labelsUrl(), { name: 'Bar' })).status).toBe(201);
    expect((await mo.delete(`${tasksUrl()}/${created.id}`)).status).toBe(204);
  });
});

describe('assignment requests', () => {
  let mo: TestClient;
  let moId: string;
  let lia: TestClient;
  let liaId: string;

  beforeEach(async () => {
    ({
      client: mo,
      user: { id: moId },
    } = await t.inviteMember(admin, orgId, 'Mo', 'mo@x.com'));
    ({
      client: lia,
      user: { id: liaId },
    } = await t.inviteMember(admin, orgId, 'Lia', 'lia@x.com'));
  });

  const requestsUrl = (taskId: string) => `${tasksUrl()}/${taskId}/requests`;

  it('lets members ask, and approving one assigns them and declines the others', async () => {
    const open = await createTask(admin);
    const asked = await mo.post(requestsUrl(open.id));
    expect(asked.status).toBe(201);
    expect(asked.body.pendingRequests).toEqual([
      expect.objectContaining({ userId: moId, name: 'Mo' }),
    ]);
    expect((await mo.post(requestsUrl(open.id))).status).toBe(409);
    await lia.post(requestsUrl(open.id));

    // Members only see their own request; managers see all.
    const seenByMo = (await mo.get(tasksUrl())).body[0];
    expect(seenByMo.pendingRequests.map((r: { userId: string }) => r.userId)).toEqual([moId]);
    const seenByAdmin = (await admin.get(tasksUrl())).body[0];
    expect(seenByAdmin.pendingRequests).toHaveLength(2);

    const moRequest = seenByAdmin.pendingRequests.find(
      (r: { userId: string }) => r.userId === moId,
    );
    const approved = await admin.post(`${requestsUrl(open.id)}/${moRequest.id}/approve`);
    expect(approved.status).toBe(200);
    expect(approved.body.assignee).toMatchObject({ type: 'member', userId: moId });
    expect(approved.body.pendingRequests).toEqual([]);

    const statuses = await t.db
      .select({ userId: taskAssignmentRequest.userId, status: taskAssignmentRequest.status })
      .from(taskAssignmentRequest)
      .where(eq(taskAssignmentRequest.taskId, open.id));
    expect(Object.fromEntries(statuses.map((s) => [s.userId, s.status]))).toEqual({
      [moId]: 'approved',
      [liaId]: 'declined',
    });
    // Lia no longer sees the task: it's Mo's now.
    expect((await lia.get(tasksUrl())).body).toEqual([]);

    const actions = await t.db
      .select({ action: activityLog.action })
      .from(activityLog)
      .where(eq(activityLog.entityType, 'task_assignment_request'));
    expect(actions.map((a) => a.action).sort()).toEqual([
      'approved',
      'declined',
      'requested',
      'requested',
    ]);
  });

  it('lets a member cancel and ask again; managers can decline', async () => {
    const open = await createTask(admin);
    await mo.post(requestsUrl(open.id));
    expect((await mo.delete(`${requestsUrl(open.id)}/mine`)).status).toBe(204);
    expect((await mo.delete(`${requestsUrl(open.id)}/mine`)).status).toBe(404);
    expect((await mo.post(requestsUrl(open.id))).status).toBe(201);

    const [request] = (await admin.get(tasksUrl())).body[0].pendingRequests;
    expect((await mo.post(`${requestsUrl(open.id)}/${request.id}/decline`)).status).toBe(403);
    expect((await admin.post(`${requestsUrl(open.id)}/${request.id}/decline`)).status).toBe(204);
    expect((await admin.get(tasksUrl())).body[0].pendingRequests).toEqual([]);
  });

  it('closes open requests when a manager assigns the task directly or deletes it', async () => {
    const first = await createTask(admin, { title: 'first' });
    const second = await createTask(admin, { title: 'second' });
    await mo.post(requestsUrl(first.id));
    await mo.post(requestsUrl(second.id));

    await admin.patch(`${tasksUrl()}/${first.id}`, { assigneeName: 'Bakker Jan' });
    await admin.delete(`${tasksUrl()}/${second.id}`);

    const rows = await t.db.select().from(taskAssignmentRequest);
    expect(rows.map((r) => r.status)).toEqual(['declined', 'declined']);
  });

  it('only takes requests for unassigned tasks', async () => {
    const mine = await createTask(admin, { assigneeUserId: moId });
    const liasTask = await createTask(admin, { assigneeUserId: liaId });
    expect((await mo.post(requestsUrl(mine.id))).status).toBe(409);
    // Hidden from Mo, so it doesn't exist for him.
    expect((await mo.post(requestsUrl(liasTask.id))).status).toBe(404);
  });
});

describe('labels', () => {
  it('are unique per event regardless of case, and can be renamed', async () => {
    const bar = await createLabel('Bar');
    expect((await admin.post(labelsUrl(), { name: 'bar' })).status).toBe(409);
    expect(
      (await admin.patch(`${labelsUrl()}/${bar.id}`, { name: 'Toog', color: 'red' })).body,
    ).toMatchObject({ name: 'Toog', color: 'red' });
    // Another event can have its own "Bar".
    const quiz = await admin.createEvent({ name: 'Quiz' });
    expect((await admin.post(labelsUrl(quiz.id), { name: 'Bar' })).status).toBe(201);

    expect((await admin.get(labelsUrl())).body.map((l: { name: string }) => l.name)).toEqual([
      'Toog',
    ]);
  });

  it('are taken off every task when deleted, and the name can be reused', async () => {
    const bar = await createLabel('Bar');
    const kassa = await createLabel('Kassa');
    await createTask(admin, { labelIds: [bar.id, kassa.id] });

    expect((await admin.delete(`${labelsUrl()}/${bar.id}`)).status).toBe(204);
    const [listed] = (await admin.get(tasksUrl())).body;
    expect(listed.labelIds).toEqual([kassa.id]);
    expect((await admin.post(labelsUrl(), { name: 'Bar' })).status).toBe(201);
    expect((await logOf('label', bar.id)).map((e) => e.action)).toEqual(['created', 'deleted']);
  });

  it('replace the task’s labels on update, logged as ids', async () => {
    const bar = await createLabel('Bar');
    const kassa = await createLabel('Kassa');
    const created = await createTask(admin, { labelIds: [bar.id] });

    const res = await admin.patch(`${tasksUrl()}/${created.id}`, { labelIds: [kassa.id] });
    expect(res.body.labelIds).toEqual([kassa.id]);
    const [entry] = (await logOf('task', created.id)).slice(-1);
    expect(entry!.changes).toEqual({ labelIds: { from: [bar.id], to: [kassa.id] } });
  });
});

describe('removing a member from the organization', () => {
  it('releases their open tasks and requests, and keeps their done tasks', async () => {
    const { client: mo, user } = await t.inviteMember(admin, orgId, 'Mo', 'mo@example.com');
    const open = await createTask(admin, { title: 'open', assigneeUserId: user.id });
    const busy = await createTask(admin, { title: 'busy', assigneeUserId: user.id });
    await admin.patch(`${tasksUrl()}/${busy.id}`, { status: 'in_progress' });
    const done = await createTask(admin, { title: 'done', assigneeUserId: user.id });
    await admin.patch(`${tasksUrl()}/${done.id}`, { status: 'done' });
    const requested = await createTask(admin, { title: 'requested' });
    await mo.post(`${tasksUrl()}/${requested.id}/requests`);

    const counts = await admin.get(`/api/members/${user.id}/open-tasks`);
    expect(counts.body).toEqual([{ eventId, eventName: 'Kerstmarkt 2026', openTasks: 2 }]);
    expect((await mo.get(`/api/members/${user.id}/open-tasks`)).status).toBe(403);

    const [membership] = await t.db
      .select({ id: member.id })
      .from(member)
      .where(and(eq(member.organizationId, orgId), eq(member.userId, user.id)));
    const removed = await admin.post('/api/auth/organization/remove-member', {
      memberIdOrEmail: membership!.id,
    });
    expect(removed.status).toBe(200);

    const list = (await admin.get(tasksUrl())).body as {
      id: string;
      assignee: unknown;
      pendingRequests: unknown[];
    }[];
    const byId = Object.fromEntries(list.map((x) => [x.id, x]));
    expect(byId[open.id]!.assignee).toBeNull();
    expect(byId[busy.id]!.assignee).toBeNull();
    expect(byId[done.id]!.assignee).toEqual({
      type: 'member',
      userId: user.id,
      name: 'Mo',
      active: false,
    });
    expect(byId[requested.id]!.pendingRequests).toEqual([]);

    const released = await t.db
      .select()
      .from(activityLog)
      .where(and(eq(activityLog.entityType, 'task'), isNotNull(activityLog.changes)));
    const releasedChanges = released
      .filter((e) => e.entityId === open.id)
      .map((e) => e.changes)
      .slice(-1);
    expect(releasedChanges).toEqual([{ assigneeUserId: { from: user.id, to: null } }]);
    expect((await admin.get(`/api/members/${user.id}/open-tasks`)).body).toEqual([]);
  });

  it('leaves tasks of archived events alone', async () => {
    const { user } = await t.inviteMember(admin, orgId, 'Mo', 'mo@example.com');
    const old = await admin.createEvent({ name: 'Oud' });
    const kept = await createTask(admin, { title: 'old', assigneeUserId: user.id }, old.id);
    await admin.post(`/api/events/${old.id}/archive`);

    // Not counted in the warning, and not released on removal: the event is read-only.
    expect((await admin.get(`/api/members/${user.id}/open-tasks`)).body).toEqual([]);
    const [membership] = await t.db
      .select({ id: member.id })
      .from(member)
      .where(and(eq(member.organizationId, orgId), eq(member.userId, user.id)));
    await admin.post('/api/auth/organization/remove-member', { memberIdOrEmail: membership!.id });

    const [listed] = (await admin.get(tasksUrl(old.id))).body;
    expect(listed).toMatchObject({ id: kept.id, assignee: { userId: user.id, active: false } });
  });

  it('shows a creator who left as no longer active', async () => {
    const { client: mo, user } = await t.inviteMember(admin, orgId, 'Mo', 'mo@example.com');
    await admin.post(`/api/events/${eventId}/members`, { userId: user.id });
    await createTask(mo, { title: 'by Mo' });
    const [membership] = await t.db
      .select({ id: member.id })
      .from(member)
      .where(and(eq(member.organizationId, orgId), eq(member.userId, user.id)));
    await admin.post('/api/auth/organization/remove-member', { memberIdOrEmail: membership!.id });

    const [listed] = (await admin.get(tasksUrl())).body;
    expect(listed.createdBy).toEqual({ userId: user.id, name: 'Mo', active: false });
  });
});

describe('editing through the task form', () => {
  it('assigns yourself to an existing task, sending every field like the form does', async () => {
    const bar = await createLabel('Bar');
    const created = await createTask(admin, { labelIds: [bar.id], dueDate: '2026-12-01' });
    const res = await admin.patch(`${tasksUrl()}/${created.id}`, {
      title: 'Tap reinigen',
      description: null,
      status: 'todo',
      priority: 'medium',
      dueDate: '2026-12-01',
      assigneeUserId: adminId,
      assigneeName: null,
      labelIds: [bar.id],
    });
    expect(res.status).toBe(200);
    expect(res.body.assignee).toMatchObject({ type: 'member', userId: adminId, active: true });
    expect(res.body.labelIds).toEqual([bar.id]);
  });
});

describe('my tasks across events', () => {
  it('lists the caller’s tasks of every live event, with the event and its labels', async () => {
    const { client: mo, user } = await t.inviteMember(admin, orgId, 'Mo', 'mo@example.com');
    const quiz = await admin.createEvent({ name: 'Quiz' });
    const archived = await admin.createEvent({ name: 'Oud' });
    const bar = await createLabel('Bar');
    await createTask(admin, { title: 'market task', assigneeUserId: user.id, labelIds: [bar.id] });
    await createTask(admin, { title: 'quiz task', assigneeUserId: user.id }, quiz.id);
    await createTask(admin, { title: 'not mine' });
    await createTask(admin, { title: 'old', assigneeUserId: user.id }, archived.id);
    await admin.post(`/api/events/${archived.id}/archive`);

    const res = await mo.get('/api/tasks/mine');
    expect(res.status).toBe(200);
    expect(titles({ body: res.body.tasks })).toEqual(['market task', 'quiz task']);
    const quizTask = res.body.tasks.find((x: { title: string }) => x.title === 'quiz task');
    expect(quizTask.event).toMatchObject({ id: quiz.id, name: 'Quiz' });
    expect(res.body.labels.map((l: { name: string }) => l.name)).toEqual(['Bar']);

    // Another organization's member sees nothing of it.
    const other = t.client();
    await other.signUp('Otto Other', 'otto@example.com');
    await other.createOrganization('Chiro Elders');
    expect((await other.get('/api/tasks/mine')).body).toEqual({ tasks: [], labels: [] });
  });
});
