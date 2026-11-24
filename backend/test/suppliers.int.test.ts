import { and, asc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { activityLog } from '../src/db/schema/index.js';
import { createTestApp, type TestApp, type TestClient } from './test-app.js';

let t: TestApp;

beforeAll(async () => {
  t = await createTestApp();
});
afterAll(() => t.close());
beforeEach(() => t.reset());

let admin: TestClient;
let orgId: string;
let eventId: string;

beforeEach(async () => {
  admin = t.client();
  await admin.signUp('Ada Admin', 'ada@example.com');
  orgId = (await admin.createOrganization('KLJ Merkem')).id;
  eventId = (await admin.createEvent()).id;
});

const suppliersUrl = '/api/suppliers';
const entriesUrl = (event = eventId) => `/api/events/${event}/budget-entries`;

interface Supplier {
  id: string;
  name: string;
  category: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  notes: string | null;
  archivedAt: string | null;
}

async function createSupplier(body: Record<string, unknown> = {}, client = admin) {
  const res = await client.post(suppliersUrl, {
    name: 'Brouwerij Van Eecke',
    category: 'drinks',
    ...body,
  });
  if (res.status !== 201) throw new Error(`create supplier failed: ${res.status} ${res.text}`);
  return res.body as Supplier;
}

async function createEntry(body: Record<string, unknown> = {}, event = eventId) {
  const res = await admin.post(entriesUrl(event), {
    type: 'expense',
    title: 'Vaten bier',
    estimatedCents: 120000,
    ...body,
  });
  if (res.status !== 201) throw new Error(`create entry failed: ${res.status} ${res.text}`);
  return res.body as { id: string; supplier: { id: string; name: string; archived: boolean } };
}

/** Announces, uploads (as the browser would) and confirms a file on the entry. */
async function attachInvoice(entryId: string, event = eventId) {
  const uploads = `/api/events/${event}/uploads`;
  const created = await admin.post(uploads, {
    name: 'Factuur bier.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 4096,
    budgetEntryId: entryId,
  });
  if (created.status !== 201) throw new Error(`create failed: ${created.status} ${created.text}`);
  const id = created.body.id as string;
  t.files.put(`orgs/${orgId}/uploads/${id}`);
  const confirmed = await admin.post(`${uploads}/${id}/confirm`);
  if (confirmed.status !== 200) throw new Error(`confirm failed: ${confirmed.status}`);
  return id;
}

const logOf = (entityId: string) =>
  t.db
    .select()
    .from(activityLog)
    .where(and(eq(activityLog.entityType, 'supplier'), eq(activityLog.entityId, entityId)))
    .orderBy(asc(activityLog.createdAt));

describe('suppliers', () => {
  it('creates a supplier with its contact details and logs it without personal data', async () => {
    const res = await admin.post(suppliersUrl, {
      name: '  Brouwerij Van Eecke ',
      category: 'drinks',
      contactName: 'Jan Van Eecke',
      email: 'Jan@VanEecke.be',
      phone: '+32 57 42 20 05',
      website: 'www.vaneecke.be',
      notes: '',
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      name: 'Brouwerij Van Eecke',
      category: 'drinks',
      contactName: 'Jan Van Eecke',
      email: 'jan@vaneecke.be',
      phone: '+32 57 42 20 05',
      website: 'https://www.vaneecke.be',
      notes: null,
      archivedAt: null,
    });

    const [log] = await logOf(res.body.id);
    expect(log).toMatchObject({ action: 'created', eventId: null, organizationId: orgId });
    expect(log!.changes).toMatchObject({
      category: { to: 'drinks' },
      contactName: null,
      email: null,
    });
  });

  it('refuses a bad email or website, and a missing name or category', async () => {
    const bad = (body: Record<string, unknown>) =>
      admin.post(suppliersUrl, { name: 'X', category: 'food', ...body });
    expect((await bad({ email: 'not an email' })).status).toBe(400);
    expect((await bad({ website: 'not a site' })).status).toBe(400);
    expect((await bad({ name: ' ' })).status).toBe(400);
    expect((await bad({ name: 'x'.repeat(121) })).status).toBe(400);
    expect((await bad({ category: 'flowers' })).status).toBe(400);
  });

  it('keeps names unique per organization, ignoring case, archived suppliers included', async () => {
    const brewery = await createSupplier();
    const dup = await admin.post(suppliersUrl, { name: 'brouwerij van eecke', category: 'food' });
    expect(dup.status).toBe(409);
    expect(dup.body.message).toMatch(/^name: a supplier with this name/);

    await admin.post(`${suppliersUrl}/${brewery.id}/archive`);
    const archivedDup = await admin.post(suppliersUrl, {
      name: 'BROUWERIJ VAN EECKE',
      category: 'drinks',
    });
    expect(archivedDup.status).toBe(409);
    expect(archivedDup.body.message).toMatch(/^name: an archived supplier/);

    const other = await createSupplier({
      name: 'Klank & Licht Decock',
      category: 'sound_and_light',
    });
    const rename = await admin.patch(`${suppliersUrl}/${other.id}`, {
      name: 'Brouwerij van Eecke',
    });
    expect(rename.status).toBe(409);
    // Changing only the case of its own name is fine.
    const recase = await admin.patch(`${suppliersUrl}/${other.id}`, {
      name: 'Klank & licht Decock',
    });
    expect(recase.status).toBe(200);
  });

  it('lists every supplier by name, archived ones flagged, with how often it was used', async () => {
    const sound = await createSupplier({
      name: 'Klank & Licht Decock',
      category: 'sound_and_light',
    });
    const brewery = await createSupplier();
    await createSupplier({ name: 'Ardense Tenten', category: 'tents_and_furniture' });
    await admin.post(`${suppliersUrl}/${sound.id}/archive`);
    await createEntry({ supplierId: brewery.id });
    await createEntry({ supplierId: brewery.id, title: 'Frisdrank' });

    const res = await admin.get(suppliersUrl);
    expect(res.status).toBe(200);
    const list = res.body as (Supplier & { eventCount: number; latestEventAt: string | null })[];
    expect(list.map((s) => s.name)).toEqual([
      'Ardense Tenten',
      'Brouwerij Van Eecke',
      'Klank & Licht Decock',
    ]);
    expect(list[1]).toMatchObject({ eventCount: 1 });
    expect(list[1]!.latestEventAt).not.toBeNull();
    expect(list[0]).toMatchObject({ eventCount: 0, latestEventAt: null });
    expect(list[2]!.archivedAt).not.toBeNull();
  });

  it('edits a supplier and clears fields with null or an empty string', async () => {
    const brewery = await createSupplier({ phone: '057 42 20 05', notes: 'Levert op vrijdag' });
    const res = await admin.patch(`${suppliersUrl}/${brewery.id}`, {
      category: 'food',
      phone: null,
      notes: '',
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ category: 'food', phone: null, notes: null });

    const logs = await logOf(brewery.id);
    expect(logs.at(-1)).toMatchObject({ action: 'updated' });
    expect(logs.at(-1)!.changes).toEqual({
      category: { from: 'drinks', to: 'food' },
      phone: null,
      notes: null,
    });
  });

  it('archives and unarchives, logged, and never deletes', async () => {
    const brewery = await createSupplier();
    const archived = await admin.post(`${suppliersUrl}/${brewery.id}/archive`);
    expect(archived.status).toBe(200);
    expect(archived.body.archivedAt).not.toBeNull();
    // Twice changes nothing.
    expect((await admin.post(`${suppliersUrl}/${brewery.id}/archive`)).status).toBe(200);

    const restored = await admin.post(`${suppliersUrl}/${brewery.id}/unarchive`);
    expect(restored.body.archivedAt).toBeNull();

    expect((await logOf(brewery.id)).map((l) => l.action)).toEqual([
      'created',
      'archived',
      'unarchived',
    ]);
    expect((await admin.delete(`${suppliersUrl}/${brewery.id}`)).status).toBe(404);
  });

  it('answers 404 for another organization’s supplier', async () => {
    const brewery = await createSupplier();
    const other = t.client();
    await other.signUp('Olaf Other', 'olaf@example.com');
    await other.createOrganization('Chiro Elders');

    expect((await other.get(suppliersUrl)).body).toEqual([]);
    expect((await other.get(`${suppliersUrl}/${brewery.id}`)).status).toBe(404);
    expect((await other.patch(`${suppliersUrl}/${brewery.id}`, { name: 'x' })).status).toBe(404);
    // The other organization's admin can't archive it either.
    expect((await other.post(`${suppliersUrl}/${brewery.id}/archive`)).status).toBe(404);
  });
});

describe('members', () => {
  let mo: TestClient;

  beforeEach(async () => {
    ({ client: mo } = await t.inviteMember(admin, orgId, 'Mo Member', 'mo@example.com'));
  });

  it('lets every member create and edit suppliers, but only admins archive them', async () => {
    const brewery = await createSupplier({}, mo);
    expect((await mo.patch(`${suppliersUrl}/${brewery.id}`, { phone: '057' })).status).toBe(200);
    expect((await mo.post(`${suppliersUrl}/${brewery.id}/archive`)).status).toBe(403);
    expect((await admin.post(`${suppliersUrl}/${brewery.id}/archive`)).status).toBe(200);
    expect((await mo.post(`${suppliersUrl}/${brewery.id}/unarchive`)).status).toBe(403);
  });
});

describe('suppliers on budget entries', () => {
  it('sets, changes and clears the supplier of an entry, logged with its id', async () => {
    const brewery = await createSupplier();
    const entry = await createEntry({ supplierId: brewery.id });
    expect(entry.supplier).toEqual({
      id: brewery.id,
      name: 'Brouwerij Van Eecke',
      archived: false,
    });

    const cleared = await admin.patch(`${entriesUrl()}/${entry.id}`, { supplierId: null });
    expect(cleared.body.supplier).toBeNull();

    const [, updated] = await t.db
      .select()
      .from(activityLog)
      .where(and(eq(activityLog.entityType, 'budget_entry'), eq(activityLog.entityId, entry.id)))
      .orderBy(asc(activityLog.createdAt));
    expect(updated!.changes).toEqual({ supplierId: { from: brewery.id, to: null } });
  });

  it('refuses an archived supplier or one of another organization, but keeps an archived one', async () => {
    const brewery = await createSupplier();
    const entry = await createEntry({ supplierId: brewery.id });
    await admin.post(`${suppliersUrl}/${brewery.id}/archive`);

    // The entry keeps it, marked archived, and other changes still go through.
    const kept = await admin.patch(`${entriesUrl()}/${entry.id}`, {
      title: 'Vaten pils',
      supplierId: brewery.id,
    });
    expect(kept.status).toBe(200);
    expect(kept.body.supplier).toMatchObject({ id: brewery.id, archived: true });

    const res = await admin.post(entriesUrl(), {
      type: 'expense',
      title: 'Nog bier',
      estimatedCents: 100,
      supplierId: brewery.id,
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/^supplierId: /);

    const other = t.client();
    await other.signUp('Olaf Other', 'olaf@example.com');
    await other.createOrganization('Chiro Elders');
    const theirs = await createSupplier({ name: 'Andere brouwer' }, other);
    const foreign = await admin.patch(`${entriesUrl()}/${entry.id}`, { supplierId: theirs.id });
    expect(foreign.status).toBe(400);
  });

  it('shows on the supplier page per event, newest first, with the entries and their files', async () => {
    const brewery = await createSupplier();
    const lastYear = (
      await admin.createEvent({
        name: 'Kerstmarkt 2025',
        startsAt: '2025-12-12T18:00:00+01:00',
        endsAt: '2025-12-13T01:00:00+01:00',
      })
    ).id;
    const old = await createEntry({ supplierId: brewery.id, actualCents: 98000 }, lastYear);
    const beer = await createEntry({ supplierId: brewery.id, actualCents: 112500 });
    const sponsor = await createEntry({
      supplierId: brewery.id,
      type: 'income',
      title: 'Sponsoring',
      estimatedCents: 25000,
    });
    const gone = await createEntry({ supplierId: brewery.id, title: 'Weggegooid' });
    await admin.delete(`${entriesUrl()}/${gone.id}`);
    await createEntry({ title: 'Zonder leverancier' });
    const invoice = await attachInvoice(beer.id);

    const res = await admin.get(`${suppliersUrl}/${brewery.id}`);
    expect(res.status).toBe(200);
    expect(res.body.supplier).toMatchObject({ id: brewery.id });
    const events = res.body.events as {
      event: { id: string; name: string };
      entries: { id: string; type: string; files: { id: string; name: string }[] }[];
    }[];
    expect(events.map((e) => e.event.id)).toEqual([eventId, lastYear]);
    expect(events[0]!.entries.map((e) => e.id)).toEqual([sponsor.id, beer.id]);
    expect(events[0]!.entries[1]!.files).toEqual([
      expect.objectContaining({ id: invoice, name: 'Factuur bier.pdf' }),
    ]);
    expect(events[1]!.entries).toEqual([
      expect.objectContaining({ id: old.id, actualCents: 98000, files: [] }),
    ]);
  });

  it('lists the suppliers of an event, by name, each with its entries', async () => {
    const brewery = await createSupplier();
    const sound = await createSupplier({ name: 'Audio Vanhee', category: 'sound_and_light' });
    await createSupplier({ name: 'Nooit gebruikt', category: 'other' });
    await createEntry({ supplierId: brewery.id });
    await createEntry({ supplierId: sound.id, title: 'Geluid zaterdag' });
    await createEntry({ supplierId: sound.id, title: 'Geluid zondag' });
    const otherEvent = (await admin.createEvent({ name: 'Fuif' })).id;
    await createEntry({ supplierId: brewery.id }, otherEvent);

    const res = await admin.get(`/api/events/${eventId}/suppliers`);
    expect(res.status).toBe(200);
    const list = res.body as { supplier: { name: string }; entries: { title: string }[] }[];
    expect(list.map((s) => s.supplier.name)).toEqual(['Audio Vanhee', 'Brouwerij Van Eecke']);
    expect(list[0]!.entries.map((e) => e.title)).toEqual(['Geluid zaterdag', 'Geluid zondag']);
    expect(list[1]!.entries).toHaveLength(1);
  });
});
