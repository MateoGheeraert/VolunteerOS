import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { activityLog, member, organization } from '../src/db/schema/index.js';
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

const update = (client: TestClient, data: Record<string, unknown>) =>
  client.post('/api/auth/organization/update', { data });

const stored = async () => {
  const [row] = await t.db.select().from(organization).where(eq(organization.id, orgId));
  return row!;
};

const updates = () =>
  t.db
    .select()
    .from(activityLog)
    .where(
      and(
        eq(activityLog.organizationId, orgId),
        eq(activityLog.entityType, 'organization'),
        eq(activityLog.action, 'updated'),
      ),
    )
    .orderBy(activityLog.createdAt);

describe('creating an organization', () => {
  it('stores the category, and Belgium as the country', async () => {
    expect(await stored()).toMatchObject({
      category: 'youth_movement',
      legalForm: null,
      enterpriseNumber: null,
      country: 'BE',
    });
  });

  it('requires a valid category', async () => {
    const client = t.client();
    await client.signUp('Nico New', 'nico@example.com');
    const withoutCategory = await client.post('/api/auth/organization/create', {
      name: 'Chiro Rita',
      slug: 'chiro-rita',
    });
    expect(withoutCategory.status).toBe(400);
    const unknownCategory = await client.post('/api/auth/organization/create', {
      name: 'Chiro Rita',
      slug: 'chiro-rita',
      category: 'pub',
    });
    expect(unknownCategory.status).toBe(400);
    expect(await t.db.select().from(organization)).toHaveLength(1);
  });

  it('validates profile fields sent along', async () => {
    const client = t.client();
    await client.signUp('Nico New', 'nico@example.com');
    const res = await client.post('/api/auth/organization/create', {
      name: 'Chiro Rita',
      slug: 'chiro-rita',
      category: 'youth_movement',
      enterpriseNumber: '0462.920.227',
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/^enterpriseNumber: /);
  });

  it('logs the category with its value', async () => {
    const [created] = await t.db
      .select()
      .from(activityLog)
      .where(and(eq(activityLog.entityId, orgId), eq(activityLog.action, 'created')));
    expect(created!.changes).toMatchObject({
      name: { to: 'KLJ Merkem' },
      category: { to: 'youth_movement' },
    });
  });
});

describe('updating the profile', () => {
  it('lets the owner fill in every field, cleaned up', async () => {
    const res = await update(owner, {
      category: 'charity',
      legalForm: 'npo',
      description: 'Jeugdbeweging in Merkem sinds 1953.',
      website: 'www.kljmerkem.be',
      foundingYear: 1953,
      enterpriseNumber: 'BE 0462.920.226',
      peppolId: '0208:0462920226',
      insurerName: 'KBC',
      insurancePolicyNumber: 'AB-123',
      street: 'Kerkstraat',
      houseNumber: '12',
      box: 'A',
      postalCode: '8650',
      city: 'Merkem',
      country: 'be',
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ website: 'https://www.kljmerkem.be', country: 'BE' });
    expect(await stored()).toMatchObject({
      category: 'charity',
      legalForm: 'npo',
      website: 'https://www.kljmerkem.be',
      foundingYear: 1953,
      enterpriseNumber: '0462920226',
      peppolId: '0208:0462920226',
      postalCode: '8650',
      country: 'BE',
    });
  });

  it('lets an admin update, and clears fields set to null or empty', async () => {
    const { client: ada } = await t.inviteMember(owner, orgId, 'Ada Admin', 'ada@example.com');
    const [adaMember] = await t.db.select().from(member).where(eq(member.role, 'member'));
    await owner.post('/api/auth/organization/update-member-role', {
      memberId: adaMember!.id,
      role: 'admin',
    });

    expect((await update(ada, { city: 'Merkem', insurerName: 'Ethias' })).status).toBe(200);
    expect((await update(ada, { city: '', insurerName: null })).status).toBe(200);
    expect(await stored()).toMatchObject({ city: null, insurerName: null });
  });

  it('refuses members, and changes nothing', async () => {
    const { client: mo } = await t.inviteMember(owner, orgId, 'Mo Member', 'mo@example.com');
    const res = await update(mo, { name: 'Overgenomen', city: 'Elders' });
    expect(res.status).toBe(403);
    expect(await stored()).toMatchObject({ name: 'KLJ Merkem', city: null });
    expect(await updates()).toHaveLength(0);
  });

  it('refuses invalid values and names the field', async () => {
    const thisYear = new Date().getFullYear();
    for (const [data, field] of [
      [{ website: 'niet een site' }, 'website'],
      [{ foundingYear: thisYear + 1 }, 'foundingYear'],
      [{ enterpriseNumber: '0462920227' }, 'enterpriseNumber'],
      [{ peppolId: 'geen-peppol' }, 'peppolId'],
      [{ category: null }, 'category'],
      [{ legalForm: 'bv' }, 'legalForm'],
    ] as const) {
      const res = await update(owner, data);
      expect({ field, status: res.status }).toEqual({ field, status: 400 });
      expect(res.body.message).toMatch(new RegExp(`^${field}: `));
    }
    expect(await updates()).toHaveLength(0);
  });

  it('keeps the slug when renaming, and never changes it', async () => {
    const { slug } = await stored();
    expect((await update(owner, { name: 'KLJ Merkem-Dorp' })).status).toBe(200);
    expect(await stored()).toMatchObject({ name: 'KLJ Merkem-Dorp', slug });

    expect((await update(owner, { slug: 'klj-merkem-dorp' })).status).toBe(400);
    expect((await stored()).slug).toBe(slug);
  });

  it('logs each change with its values before and after, by the acting user', async () => {
    await update(owner, { legalForm: 'de_facto_association', city: 'Merkem' });
    await update(owner, {
      legalForm: 'npo',
      enterpriseNumber: '0462920226',
      city: 'Merkem',
      foundingYear: 1953,
    });

    const [first, second] = await updates();
    expect(first).toMatchObject({
      actorType: 'user',
      actorId: ownerId,
      entityId: orgId,
      changes: {
        legalForm: { from: null, to: 'de_facto_association' },
        city: { from: null, to: 'Merkem' },
      },
    });
    // Only what changed: the city was sent again but stayed the same.
    expect(second!.changes).toEqual({
      legalForm: { from: 'de_facto_association', to: 'npo' },
      enterpriseNumber: { from: null, to: '0462920226' },
      foundingYear: { from: null, to: 1953 },
    });
  });
});
