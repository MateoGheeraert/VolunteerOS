import { and, asc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { activityLog, budgetEntry, upload } from '../src/db/schema/index.js';
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

const entriesUrl = (event = eventId) => `/api/events/${event}/budget-entries`;
const labelsUrl = (event = eventId) => `/api/events/${event}/labels`;
const uploadsUrl = (event = eventId) => `/api/events/${event}/uploads`;

interface Entry {
  id: string;
  type: 'income' | 'expense';
  title: string;
  estimatedCents: number | null;
  actualCents: number | null;
  notes: string | null;
  task: { id: string; title: string } | null;
  labelIds: string[];
  fileCount: number;
  updatedAt: string;
}

async function createEntry(body: Record<string, unknown> = {}, client = admin, event = eventId) {
  const res = await client.post(entriesUrl(event), {
    type: 'expense',
    title: 'Tent huren',
    estimatedCents: 45000,
    ...body,
  });
  if (res.status !== 201) throw new Error(`create entry failed: ${res.status} ${res.text}`);
  return res.body as Entry;
}

async function createLabel(name: string, event = eventId) {
  const res = await admin.post(labelsUrl(event), { name, color: 'green' });
  if (res.status !== 201) throw new Error(`create label failed: ${res.status} ${res.text}`);
  return res.body as { id: string };
}

async function createTask(body: Record<string, unknown> = {}, event = eventId) {
  const res = await admin.post(`/api/events/${event}/tasks`, { title: 'Tent zoeken', ...body });
  if (res.status !== 201) throw new Error(`create task failed: ${res.status} ${res.text}`);
  return res.body as { id: string };
}

/** Announces, uploads (as the browser would) and confirms a file on the entry. */
async function attachFile(entryId: string) {
  const created = await admin.post(uploadsUrl(), {
    name: 'Factuur tent.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 2048,
    budgetEntryId: entryId,
  });
  if (created.status !== 201) throw new Error(`create failed: ${created.status} ${created.text}`);
  const id = created.body.id as string;
  t.files.put(`orgs/${orgId}/uploads/${id}`);
  const confirmed = await admin.post(`${uploadsUrl()}/${id}/confirm`);
  if (confirmed.status !== 200) throw new Error(`confirm failed: ${confirmed.status}`);
  return confirmed.body as { id: string; budgetEntry: { id: string; title: string } | null };
}

const logOf = (entityType: string, entityId: string) =>
  t.db
    .select()
    .from(activityLog)
    .where(and(eq(activityLog.entityType, entityType), eq(activityLog.entityId, entityId)))
    .orderBy(asc(activityLog.createdAt));

describe('budget entries', () => {
  it('creates an entry with its amounts, labels and task, and logs it', async () => {
    const catering = await createLabel('Catering');
    const task = await createTask();
    const res = await admin.post(entriesUrl(), {
      type: 'expense',
      title: 'Tent huren',
      estimatedCents: 45000,
      notes: 'Offerte van Verhuur Vandamme',
      taskId: task.id,
      labelIds: [catering.id],
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      eventId,
      type: 'expense',
      title: 'Tent huren',
      estimatedCents: 45000,
      actualCents: null,
      notes: 'Offerte van Verhuur Vandamme',
      task: { id: task.id, title: 'Tent zoeken' },
      labelIds: [catering.id],
      fileCount: 0,
    });

    const [entry] = await logOf('budget_entry', res.body.id);
    expect(entry).toMatchObject({ action: 'created', eventId, actorId: adminId });
    // Amounts and links are kept; free text (title, notes) by name only.
    expect(entry!.changes).toEqual({
      type: { to: 'expense' },
      title: null,
      estimatedCents: { to: 45000 },
      notes: null,
      taskId: { to: task.id },
      createdByUserId: { to: adminId },
      labelIds: { to: [catering.id] },
    });
  });

  it('lists income first, then expenses, oldest first', async () => {
    await createEntry({ title: 'Tent huren' });
    await createEntry({ type: 'income', title: 'Tickets', estimatedCents: 120000 });
    await createEntry({ title: 'Drank', actualCents: 30000, estimatedCents: null });
    await createEntry({ type: 'income', title: 'Sponsoring', actualCents: 50000 });

    const res = await admin.get(entriesUrl());
    expect(res.status).toBe(200);
    expect(res.body.map((e: Entry) => e.title)).toEqual([
      'Tickets',
      'Sponsoring',
      'Tent huren',
      'Drank',
    ]);
  });

  it('needs at least one amount, and whole cents in range', async () => {
    const without = await admin.post(entriesUrl(), { type: 'income', title: 'Tickets' });
    expect(without.status).toBe(400);
    for (const estimatedCents of [-1, 12.5, 1_000_000_000]) {
      const res = await admin.post(entriesUrl(), { type: 'income', title: 'x', estimatedCents });
      expect(res.status).toBe(400);
    }
    expect((await createEntry({ estimatedCents: 0 })).estimatedCents).toBe(0);
    expect((await createEntry({ estimatedCents: 999_999_999 })).estimatedCents).toBe(999_999_999);
  });

  it('updates fields, keeps an amount, and logs what changed', async () => {
    const created = await createEntry();
    const url = `${entriesUrl()}/${created.id}`;

    const res = await admin.patch(url, { actualCents: 44950, notes: '' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ estimatedCents: 45000, actualCents: 44950, notes: null });

    // Clearing the only remaining amount is refused; clearing one of two is fine.
    expect((await admin.patch(url, { estimatedCents: null })).status).toBe(200);
    expect((await admin.patch(url, { actualCents: null })).status).toBe(400);

    const log = await logOf('budget_entry', created.id);
    expect(log.map((e) => e.action)).toEqual(['created', 'updated', 'updated']);
    expect(log[1]!.changes).toEqual({ actualCents: { from: null, to: 44950 } });
    expect(log[2]!.changes).toEqual({ estimatedCents: { from: 45000, to: null } });
  });

  it('replaces the labels, logged as ids', async () => {
    const bar = await createLabel('Bar');
    const catering = await createLabel('Catering');
    const created = await createEntry({ labelIds: [bar.id] });

    const res = await admin.patch(`${entriesUrl()}/${created.id}`, { labelIds: [catering.id] });
    expect(res.body.labelIds).toEqual([catering.id]);
    // Labels live in their own table, but the entry still counts as updated.
    expect(res.body.updatedAt > created.updatedAt).toBe(true);
    const [entry] = (await logOf('budget_entry', created.id)).slice(-1);
    expect(entry!.changes).toEqual({ labelIds: { from: [bar.id], to: [catering.id] } });
  });

  it('only takes labels and tasks of the same event', async () => {
    const quiz = await admin.createEvent({ name: 'Quiz' });
    const otherLabel = await createLabel('Bar', quiz.id);
    const otherTask = await createTask({}, quiz.id);

    expect(
      (
        await admin.post(entriesUrl(), {
          type: 'income',
          title: 'x',
          estimatedCents: 1,
          labelIds: [otherLabel.id],
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await admin.post(entriesUrl(), {
          type: 'income',
          title: 'x',
          estimatedCents: 1,
          taskId: otherTask.id,
        })
      ).status,
    ).toBe(400);
  });

  it('deletes an entry with its files, and logs both', async () => {
    const created = await createEntry();
    const file = await attachFile(created.id);
    expect((await admin.get(entriesUrl())).body[0].fileCount).toBe(1);

    expect((await admin.delete(`${entriesUrl()}/${created.id}`)).status).toBe(204);
    expect((await admin.get(entriesUrl())).body).toEqual([]);
    expect((await admin.patch(`${entriesUrl()}/${created.id}`, { title: 'x' })).status).toBe(404);

    // Soft-deleted: the row stays, with its file, for the activity log.
    const [row] = await t.db.select().from(budgetEntry).where(eq(budgetEntry.id, created.id));
    expect(row!.deletedAt).not.toBeNull();
    const [fileRow] = await t.db.select().from(upload).where(eq(upload.id, file.id));
    expect(fileRow!.deletedAt).not.toBeNull();
    expect((await logOf('budget_entry', created.id)).map((e) => e.action)).toEqual([
      'created',
      'deleted',
    ]);
    expect((await logOf('upload', file.id)).map((e) => e.action)).toEqual(['created', 'deleted']);
  });

  it('keeps the entry when its task is deleted, without the link, and logs that', async () => {
    const task = await createTask();
    const created = await createEntry({ taskId: task.id });

    expect((await admin.delete(`/api/events/${eventId}/tasks/${task.id}`)).status).toBe(204);
    const [listed] = (await admin.get(entriesUrl())).body as Entry[];
    expect(listed!.task).toBeNull();
    const [entry] = (await logOf('budget_entry', created.id)).slice(-1);
    expect(entry!.changes).toEqual({ taskId: { from: task.id, to: null } });
  });

  it('rejects writes on an archived event, but still lists its entries', async () => {
    const created = await createEntry();
    await admin.post(`/api/events/${eventId}/archive`);

    expect((await admin.get(entriesUrl())).body).toHaveLength(1);
    expect(
      (await admin.post(entriesUrl(), { type: 'income', title: 'x', estimatedCents: 1 })).status,
    ).toBe(409);
    expect((await admin.patch(`${entriesUrl()}/${created.id}`, { title: 'x' })).status).toBe(409);
    expect((await admin.delete(`${entriesUrl()}/${created.id}`)).status).toBe(409);
  });

  it('answers 404 for another organization’s budget', async () => {
    const created = await createEntry();
    const other = t.client();
    await other.signUp('Olaf Other', 'olaf@example.com');
    await other.createOrganization('Chiro Elders');

    expect((await other.get(entriesUrl())).status).toBe(404);
    expect((await other.patch(`${entriesUrl()}/${created.id}`, { title: 'x' })).status).toBe(404);
    expect((await other.delete(`${entriesUrl()}/${created.id}`)).status).toBe(404);
  });
});

describe('members', () => {
  let mo: TestClient;
  let moId: string;

  beforeEach(async () => {
    ({
      client: mo,
      user: { id: moId },
    } = await t.inviteMember(admin, orgId, 'Mo Member', 'mo@example.com'));
  });

  it('read the budget but cannot change it, nor its files', async () => {
    const created = await createEntry();
    expect((await mo.get(entriesUrl())).body).toHaveLength(1);

    expect(
      (await mo.post(entriesUrl(), { type: 'income', title: 'x', estimatedCents: 1 })).status,
    ).toBe(403);
    expect((await mo.patch(`${entriesUrl()}/${created.id}`, { title: 'x' })).status).toBe(403);
    expect((await mo.delete(`${entriesUrl()}/${created.id}`)).status).toBe(403);
    const upload = await mo.post(uploadsUrl(), {
      name: 'Factuur.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 10,
      budgetEntryId: created.id,
    });
    expect(upload.status).toBe(403);
  });

  it('do not see the title of a task they cannot see through the budget', async () => {
    const lia = await t.inviteMember(admin, orgId, 'Lia', 'lia@example.com');
    const hidden = await createTask({ assigneeUserId: lia.user.id });
    await createEntry({ taskId: hidden.id });

    const [entry] = (await mo.get(entriesUrl())).body as Entry[];
    expect(entry!.task).toBeNull();
    const [asAdmin] = (await admin.get(entriesUrl())).body as Entry[];
    expect(asAdmin!.task?.id).toBe(hidden.id);
  });

  it('get full rights on events they manage', async () => {
    await admin.post(`/api/events/${eventId}/members`, { userId: moId });
    const created = await createEntry({}, mo);
    expect((await mo.patch(`${entriesUrl()}/${created.id}`, { actualCents: 100 })).status).toBe(
      200,
    );
    expect((await mo.delete(`${entriesUrl()}/${created.id}`)).status).toBe(204);
  });
});

describe('budget entry files', () => {
  it('lists an entry’s files on their own and with the event’s, saying which entry', async () => {
    const created = await createEntry();
    const file = await attachFile(created.id);
    expect(file.budgetEntry).toEqual({ id: created.id, title: 'Tent huren' });

    const own = await admin.get(`${uploadsUrl()}?budgetEntryId=${created.id}`);
    expect(own.body.uploads.map((u: { id: string }) => u.id)).toEqual([file.id]);
    const all = await admin.get(uploadsUrl());
    expect(all.body.uploads.map((u: { id: string }) => u.id)).toEqual([file.id]);
  });

  it('only attaches files to live entries of the same event', async () => {
    const quiz = await admin.createEvent({ name: 'Quiz' });
    const other = await createEntry({}, admin, quiz.id);
    const res = await admin.post(uploadsUrl(), {
      name: 'Factuur.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 10,
      budgetEntryId: other.id,
    });
    expect(res.status).toBe(404);
    expect((await admin.get(`${uploadsUrl()}?budgetEntryId=${other.id}`)).status).toBe(404);
  });
});

describe('labels shared with tasks', () => {
  it('counts what carries a label, and deleting it takes it off everything', async () => {
    const bar = await createLabel('Bar');
    const created = await createEntry({ labelIds: [bar.id] });
    await createTask({ labelIds: [bar.id] });
    await createTask({ labelIds: [bar.id] });

    const usage = await admin.get(`${labelsUrl()}/${bar.id}/usage`);
    expect(usage.body).toEqual({ tasks: 2, budgetEntries: 1 });

    expect((await admin.delete(`${labelsUrl()}/${bar.id}`)).status).toBe(204);
    const [entry] = (await admin.get(entriesUrl())).body as Entry[];
    expect(entry!.labelIds).toEqual([]);
    expect(entry!.id).toBe(created.id);
    expect((await admin.get(`${labelsUrl()}/${bar.id}/usage`)).status).toBe(404);
  });
});
