import { and, asc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { activityLog, upload } from '../src/db/schema/index.js';
import {
  MAX_UPLOAD_BYTES,
  ORGANIZATION_STORAGE_LIMIT_BYTES,
} from '../src/features/uploads/upload-rules.js';
import { UploadsCleanupService } from '../src/features/uploads/uploads-cleanup.service.js';
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

const uploadsUrl = (event = eventId) => `/api/events/${event}/uploads`;
const pdf = { name: 'Offerte tent.pdf', mimeType: 'application/pdf', sizeBytes: 2048 };

const keyOf = (id: string) => `orgs/${orgId}/uploads/${id}`;

/** Announces, uploads (as the browser would) and confirms a file. */
async function uploadFile(client: TestClient, body: Record<string, unknown> = {}) {
  const created = await client.post(uploadsUrl(), { ...pdf, ...body });
  if (created.status !== 201) throw new Error(`create failed: ${created.status} ${created.text}`);
  const id = created.body.id as string;
  t.files.put(keyOf(id));
  const confirmed = await client.post(`${uploadsUrl()}/${id}/confirm`);
  if (confirmed.status !== 200) {
    throw new Error(`confirm failed: ${confirmed.status} ${confirmed.text}`);
  }
  return confirmed.body as { id: string; name: string; canChange: boolean };
}

async function createTask(body: Record<string, unknown> = {}) {
  const res = await admin.post(`/api/events/${eventId}/tasks`, { title: 'Tent huren', ...body });
  if (res.status !== 201) throw new Error(`create task failed: ${res.status} ${res.text}`);
  return res.body as { id: string };
}

const logOf = (entityId: string) =>
  t.db
    .select()
    .from(activityLog)
    .where(and(eq(activityLog.entityType, 'upload'), eq(activityLog.entityId, entityId)))
    .orderBy(asc(activityLog.createdAt));

const rowOf = async (id: string) => (await t.db.select().from(upload).where(eq(upload.id, id)))[0]!;

describe('uploading', () => {
  it('signs an upload URL, lists the file once confirmed, and logs it', async () => {
    const created = await admin.post(uploadsUrl(), pdf);
    expect(created.status).toBe(201);
    const id = created.body.id as string;
    expect(created.body).toMatchObject({
      uploadUrl: `https://storage.test/upload/${keyOf(id)}`,
      headers: { 'Content-Type': 'application/pdf' },
    });
    expect(t.files.uploads).toEqual([
      { key: keyOf(id), mimeType: 'application/pdf', sizeBytes: 2048, expiresInSeconds: 300 },
    ]);

    // Not listed until confirmed, and confirming before the upload is too early.
    expect((await admin.get(uploadsUrl())).body.uploads).toEqual([]);
    expect((await admin.post(`${uploadsUrl()}/${id}/confirm`)).status).toBe(409);

    t.files.put(keyOf(id));
    const confirmed = await admin.post(`${uploadsUrl()}/${id}/confirm`);
    expect(confirmed.status).toBe(200);
    expect(confirmed.body).toMatchObject({
      id,
      name: 'Offerte tent.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 2048,
      uploadedBy: { userId: adminId, name: 'Ada Admin' },
      task: null,
      canChange: true,
    });
    // Confirming again changes nothing.
    expect((await admin.post(`${uploadsUrl()}/${id}/confirm`)).status).toBe(200);

    const list = await admin.get(uploadsUrl());
    expect(list.body).toMatchObject({
      uploads: [{ id }],
      storage: { usedBytes: 2048, limitBytes: ORGANIZATION_STORAGE_LIMIT_BYTES },
      enabled: true,
      canAddToEvent: true,
    });

    const log = await logOf(id);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ action: 'created', eventId, actorId: adminId });
    // The file name is free text: logged by name only.
    expect(log[0]!.changes).toMatchObject({
      name: null,
      mimeType: { to: 'application/pdf' },
      sizeBytes: { to: 2048 },
    });
  });

  it('refuses disallowed types, mismatched extensions and oversized files', async () => {
    const bad = [
      { name: 'logo.svg', mimeType: 'image/svg+xml' },
      { name: 'pagina.html', mimeType: 'text/html' },
      { name: 'offerte.exe', mimeType: 'application/pdf' },
      { sizeBytes: MAX_UPLOAD_BYTES + 1 },
      { sizeBytes: 0 },
      { name: '   ' },
    ];
    for (const body of bad) {
      const res = await admin.post(uploadsUrl(), { ...pdf, ...body });
      expect({ body, status: res.status }).toEqual({ body, status: 400 });
    }
  });

  it('throws away an upload that differs from what was announced', async () => {
    const created = await admin.post(uploadsUrl(), pdf);
    const id = created.body.id as string;
    t.files.put(keyOf(id), { sizeBytes: 99_999 });

    expect((await admin.post(`${uploadsUrl()}/${id}/confirm`)).status).toBe(400);
    const row = await rowOf(id);
    expect(row.deletedAt).not.toBeNull();
    expect(row.purgedAt).not.toBeNull();
    expect(t.files.objects.has(keyOf(id))).toBe(false);
    expect(await logOf(id)).toEqual([]);
  });

  it('stops at the organization storage limit, counting uploads in progress', async () => {
    const almostFull = ORGANIZATION_STORAGE_LIMIT_BYTES - 3000;
    await t.db.insert(upload).values({
      organizationId: orgId,
      storageKey: 'orgs/x/uploads/big',
      name: 'groot.pdf',
      mimeType: 'application/pdf',
      sizeBytes: almostFull,
      status: 'ready',
      uploadedByUserId: adminId,
    });
    expect((await admin.post(uploadsUrl(), pdf)).status).toBe(201);
    // 2048 is reserved by the pending upload, so another one doesn't fit.
    expect((await admin.post(uploadsUrl(), pdf)).status).toBe(409);
  });

  it('answers 503 when file storage is off', async () => {
    const file = await uploadFile(admin);
    t.files.enabled = false;
    expect((await admin.post(uploadsUrl(), pdf)).status).toBe(503);
    expect((await admin.get(`${uploadsUrl()}/${file.id}/download`)).status).toBe(503);
    const list = await admin.get(uploadsUrl());
    expect(list.body).toMatchObject({ enabled: false, uploads: [{ id: file.id }] });
  });
});

describe('downloading', () => {
  it('signs a short-lived URL per request, inline for PDFs and images', async () => {
    const file = await uploadFile(admin);
    const csv = await uploadFile(admin, { name: 'lijst.csv', mimeType: 'text/csv' });

    const res = await admin.get(`${uploadsUrl()}/${file.id}/download`);
    expect(res.status).toBe(200);
    expect(res.body.url).toBe(`https://storage.test/download/${keyOf(file.id)}`);
    await admin.get(`${uploadsUrl()}/${csv.id}/download`);
    expect(t.files.downloads).toEqual([
      {
        key: keyOf(file.id),
        fileName: 'Offerte tent.pdf',
        mimeType: 'application/pdf',
        inline: true,
        expiresInSeconds: 300,
      },
      expect.objectContaining({ fileName: 'lijst.csv', inline: false }),
    ]);
  });

  it('hides files of other events and organizations', async () => {
    const file = await uploadFile(admin);
    const otherEvent = (await admin.createEvent({ name: 'Paasfeest' })).id;
    expect((await admin.get(`${uploadsUrl(otherEvent)}/${file.id}/download`)).status).toBe(404);

    const stranger = t.client();
    await stranger.signUp('Sam Stranger', 'sam@example.com');
    await stranger.createOrganization('Chiro Elders');
    expect((await stranger.get(`${uploadsUrl()}/${file.id}/download`)).status).toBe(404);
  });
});

describe('permissions', () => {
  let mo: TestClient;
  let moId: string;

  beforeEach(async () => {
    const invited = await t.inviteMember(admin, orgId, 'Mo Member', 'mo@example.com');
    mo = invited.client;
    moId = invited.user.id;
  });

  it('lets members read event files, but only managers add them', async () => {
    const file = await uploadFile(admin);
    const list = await mo.get(uploadsUrl());
    expect(list.body).toMatchObject({
      uploads: [{ id: file.id, canChange: false }],
      canAddToEvent: false,
    });
    expect((await mo.get(`${uploadsUrl()}/${file.id}/download`)).status).toBe(200);
    expect((await mo.post(uploadsUrl(), pdf)).status).toBe(403);
    expect((await mo.delete(`${uploadsUrl()}/${file.id}`)).status).toBe(403);
  });

  it('lets the assignee add files to their task and change their own', async () => {
    const task = await createTask({ assigneeUserId: moId });
    const mine = await uploadFile(mo, {
      taskId: task.id,
      name: 'bonnetje.jpg',
      mimeType: 'image/jpeg',
    });
    expect(mine.canChange).toBe(true);
    const adminsFile = await uploadFile(admin, { taskId: task.id });

    const list = await mo.get(`${uploadsUrl()}?taskId=${task.id}`);
    expect(list.body.uploads).toMatchObject([
      { id: adminsFile.id, canChange: false, task: { id: task.id, title: 'Tent huren' } },
      { id: mine.id, canChange: true },
    ]);
    expect((await mo.delete(`${uploadsUrl()}/${adminsFile.id}`)).status).toBe(403);
    expect((await mo.delete(`${uploadsUrl()}/${mine.id}`)).status).toBe(204);
  });

  it('hides files of tasks the member does not see', async () => {
    const zoesTask = await createTask({ assigneeName: 'Zoë Extern' });
    const hidden = await uploadFile(admin, { taskId: zoesTask.id });
    const unassigned = await createTask();
    expect((await mo.post(uploadsUrl(), { ...pdf, taskId: unassigned.id })).status).toBe(403);

    expect((await mo.get(uploadsUrl())).body.uploads).toEqual([]);
    expect((await mo.get(`${uploadsUrl()}?taskId=${zoesTask.id}`)).status).toBe(404);
    expect((await mo.get(`${uploadsUrl()}/${hidden.id}/download`)).status).toBe(404);
    expect((await mo.post(uploadsUrl(), { ...pdf, taskId: zoesTask.id })).status).toBe(404);
    // The event's combined list shows it to managers, marked with its task.
    expect((await admin.get(uploadsUrl())).body.uploads).toMatchObject([
      { id: hidden.id, task: { id: zoesTask.id } },
    ]);
  });
});

describe('changing files', () => {
  it('renames a file, keeping its extension, and logs the rename by name only', async () => {
    const file = await uploadFile(admin);
    const res = await admin.patch(`${uploadsUrl()}/${file.id}`, { name: 'Offerte tent v2.pdf' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Offerte tent v2.pdf');
    expect((await admin.patch(`${uploadsUrl()}/${file.id}`, { name: 'offerte.exe' })).status).toBe(
      400,
    );

    const log = await logOf(file.id);
    expect(log.map((entry) => entry.action)).toEqual(['created', 'renamed']);
    expect(log[1]!.changes).toEqual({ name: null });
  });

  it('soft-deletes a file, frees its space and logs it', async () => {
    const file = await uploadFile(admin);
    expect((await admin.delete(`${uploadsUrl()}/${file.id}`)).status).toBe(204);

    const list = await admin.get(uploadsUrl());
    expect(list.body).toMatchObject({ uploads: [], storage: { usedBytes: 0 } });
    const row = await rowOf(file.id);
    expect(row.deletedAt).not.toBeNull();
    expect(row.purgedAt).toBeNull();
    // Still in storage until the cleanup job's retention period is over.
    expect(t.files.objects.has(keyOf(file.id))).toBe(true);
    expect((await logOf(file.id)).map((entry) => entry.action)).toEqual(['created', 'deleted']);
  });

  it('deletes a task’s files with the task', async () => {
    const task = await createTask();
    const file = await uploadFile(admin, { taskId: task.id });
    expect((await admin.delete(`/api/events/${eventId}/tasks/${task.id}`)).status).toBe(204);

    expect((await rowOf(file.id)).deletedAt).not.toBeNull();
    expect((await admin.get(uploadsUrl())).body.uploads).toEqual([]);
    expect((await logOf(file.id)).map((entry) => entry.action)).toEqual(['created', 'deleted']);
  });

  it('keeps files of an archived event readable but unchangeable', async () => {
    const file = await uploadFile(admin);
    expect((await admin.post(`/api/events/${eventId}/archive`)).status).toBe(200);

    expect((await admin.get(`${uploadsUrl()}/${file.id}/download`)).status).toBe(200);
    expect((await admin.post(uploadsUrl(), pdf)).status).toBe(409);
    expect((await admin.delete(`${uploadsUrl()}/${file.id}`)).status).toBe(409);
  });
});

describe('cleanup job', () => {
  const DAY = 24 * 60 * 60 * 1000;

  it('removes abandoned uploads at once and deleted files after 30 days', async () => {
    const cleanup = t.app.get(UploadsCleanupService);
    const now = new Date();

    const abandoned = (await admin.post(uploadsUrl(), pdf)).body.id as string;
    t.files.put(keyOf(abandoned));
    const oldDeleted = await uploadFile(admin);
    const recentDeleted = await uploadFile(admin);
    const kept = await uploadFile(admin);
    const fresh = (await admin.post(uploadsUrl(), pdf)).body.id as string;

    await admin.delete(`${uploadsUrl()}/${oldDeleted.id}`);
    await admin.delete(`${uploadsUrl()}/${recentDeleted.id}`);
    await t.db
      .update(upload)
      .set({ createdAt: new Date(now.getTime() - 2 * DAY) })
      .where(eq(upload.id, abandoned));
    await t.db
      .update(upload)
      .set({ deletedAt: new Date(now.getTime() - 31 * DAY) })
      .where(eq(upload.id, oldDeleted.id));

    expect(await cleanup.run(now)).toBe(2);
    expect(t.files.deleted.sort()).toEqual([keyOf(abandoned), keyOf(oldDeleted.id)].sort());

    const abandonedRow = await rowOf(abandoned);
    expect(abandonedRow.deletedAt).not.toBeNull();
    expect(abandonedRow.purgedAt).not.toBeNull();
    expect((await rowOf(oldDeleted.id)).purgedAt).not.toBeNull();
    expect((await rowOf(recentDeleted.id)).purgedAt).toBeNull();
    expect((await rowOf(kept.id)).deletedAt).toBeNull();
    expect((await rowOf(fresh)).deletedAt).toBeNull();

    // Nothing left to do the second time.
    expect(await cleanup.run(now)).toBe(0);
  });
});
