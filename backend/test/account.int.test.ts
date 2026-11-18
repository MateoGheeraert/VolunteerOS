import { and, asc, eq, isNull } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { activityLog, emailDelivery, user, userProfile } from '../src/db/schema/index.js';
import { createTestApp, type TestApp, type TestClient } from './test-app.js';

let t: TestApp;

beforeAll(async () => {
  t = await createTestApp();
});
afterAll(() => t.close());
beforeEach(() => t.reset());

const PASSWORD = 'correct-horse-battery';

let sofie: TestClient;
let sofieId: string;

beforeEach(async () => {
  sofie = t.client();
  sofieId = (await sofie.signUp('Sofie Peeters', 'sofie@example.com')).id;
});

/** The account-level log entries of a user, oldest first. */
const accountLog = (userId: string) =>
  t.db
    .select()
    .from(activityLog)
    .where(and(eq(activityLog.entityType, 'user'), eq(activityLog.entityId, userId)))
    .orderBy(asc(activityLog.createdAt));

/** The token of the last verify-email link sent to an address. */
function verifyToken(to: string): string {
  const text = t.emails.lastTo(to)?.text ?? '';
  const match = /\/verify-email\?token=(\S+)/.exec(text);
  if (!match) throw new Error(`no verify-email link sent to ${to}`);
  return decodeURIComponent(match[1]!);
}

const openVerifyLink = (client: TestClient, token: string) =>
  client.get(`/api/auth/verify-email?token=${encodeURIComponent(token)}`);

async function signIn(email: string, password = PASSWORD) {
  const client = t.client();
  const res = await client.post('/api/auth/sign-in/email', { email, password });
  return { client, status: res.status };
}

const fullAddress = {
  street: 'Kerkstraat',
  houseNumber: '12',
  box: 'B',
  postalCode: '8650',
  city: 'Merkem',
};

describe('email verification', () => {
  it('is sent at sign-up, does not block signing in, and is logged once confirmed', async () => {
    const email = t.emails.lastTo('sofie@example.com')!;
    expect(email.subject).toBe('Bevestig je e-mailadres');
    expect(email.html).toContain('href="http://localhost:3000/verify-email?token=');

    // Signing in works before verifying.
    expect((await signIn('sofie@example.com')).status).toBe(200);
    expect((await sofie.get('/api/me/profile')).body.emailVerified).toBe(false);

    const token = verifyToken('sofie@example.com');
    const [delivery] = await t.db.select().from(emailDelivery);
    expect(delivery!.idempotencyKey).toMatch(/^email-verification:[0-9a-f]{64}$/);
    expect(JSON.stringify(delivery)).not.toContain(token);

    // The link can be opened without a session, e.g. on a phone.
    expect((await openVerifyLink(t.client(), token)).status).toBe(200);
    expect((await sofie.get('/api/me/profile')).body.emailVerified).toBe(true);

    const log = await accountLog(sofieId);
    expect(log).toEqual([
      expect.objectContaining({
        organizationId: null,
        actorType: 'user',
        actorId: sofieId,
        action: 'email_verified',
        changes: null,
      }),
    ]);
  });

  it('can be resent from the settings', async () => {
    // Within the same second the link is identical, and the same link is never sent twice.
    t.emails.reset();
    await t.db.delete(emailDelivery);
    const res = await sofie.post('/api/auth/send-verification-email', {
      email: 'sofie@example.com',
    });
    expect(res.status).toBe(200);
    expect(t.emails.lastTo('sofie@example.com')?.subject).toBe('Bevestig je e-mailadres');
  });
});

describe('profile', () => {
  it('starts empty and stores what is filled in, the phone in E.164', async () => {
    const empty = await sofie.get('/api/me/profile');
    expect(empty.status).toBe(200);
    expect(empty.body).toEqual({
      userId: sofieId,
      name: 'Sofie Peeters',
      email: 'sofie@example.com',
      emailVerified: false,
      phone: null,
      address: null,
      birthDate: null,
    });

    const res = await sofie.patch('/api/me/profile', {
      phone: '0470 12 34 56',
      address: fullAddress,
      birthDate: '1990-05-17',
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      phone: '+32470123456',
      address: { ...fullAddress, country: 'BE' },
      birthDate: '1990-05-17',
    });
    expect((await sofie.get('/api/me/profile')).body).toEqual(res.body);
  });

  it('changes only the fields sent, and null clears one', async () => {
    await sofie.patch('/api/me/profile', { phone: '+32470123456', address: fullAddress });

    const res = await sofie.patch('/api/me/profile', { phone: null });
    expect(res.body.phone).toBeNull();
    expect(res.body.address).toMatchObject(fullAddress);

    const cleared = await sofie.patch('/api/me/profile', { address: null });
    expect(cleared.body.address).toBeNull();
    const [row] = await t.db.select().from(userProfile).where(eq(userProfile.userId, sofieId));
    expect(row).toMatchObject({ street: null, city: null, country: null });
  });

  it('changes the name', async () => {
    const res = await sofie.patch('/api/me/profile', { name: '  Sofie Janssens ' });
    expect(res.body.name).toBe('Sofie Janssens');
    const [row] = await t.db.select().from(user).where(eq(user.id, sofieId));
    expect(row!.name).toBe('Sofie Janssens');
    expect((await sofie.get('/api/auth/get-session')).body.user.name).toBe('Sofie Janssens');
  });

  it('refuses invalid values', async () => {
    const cases: [object, string][] = [
      [{ phone: '12' }, 'phone'],
      [{ phone: 'bel me' }, 'phone'],
      [{ birthDate: '2099-01-01' }, 'birthDate'],
      [{ birthDate: '17/05/1990' }, 'birthDate'],
      [{ address: { ...fullAddress, street: '' } }, 'address'],
      [{ address: { ...fullAddress, postalCode: '86500' } }, 'address'],
      [{ address: { ...fullAddress, country: 'Belgium' } }, 'address'],
      [{ name: '   ' }, 'name'],
    ];
    for (const [body, field] of cases) {
      const res = await sofie.patch('/api/me/profile', body);
      expect({ body, status: res.status }).toEqual({ body, status: 400 });
      expect(JSON.stringify(res.body.message)).toContain(`${field}`);
    }
    expect(await t.db.select().from(userProfile)).toEqual([]);
  });

  it('refuses anyone under 13 (the exact boundary is in profile-rules.spec.ts)', async () => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels' }).format();
    const [year, month, day] = today.split('-').map(Number) as [number, number, number];
    // Date.UTC rolls over invalid days (29 February in a common year) to a real one.
    const thirteenYearsAgo = (shiftDays: number) =>
      new Date(Date.UTC(year - 13, month - 1, day + shiftDays)).toISOString().slice(0, 10);

    const tooYoung = await sofie.patch('/api/me/profile', { birthDate: thirteenYearsAgo(1) });
    expect(tooYoung.status).toBe(400);
    expect(tooYoung.body.message).toEqual(['birthDate: Must be at least 13 years old']);

    const ok = await sofie.patch('/api/me/profile', { birthDate: thirteenYearsAgo(-1) });
    expect(ok.status).toBe(200);
  });

  it('logs every change by field name, without organization and without any value', async () => {
    await sofie.patch('/api/me/profile', {
      name: 'Sofie Janssens',
      phone: '0470 12 34 56',
      address: fullAddress,
      birthDate: '1990-05-17',
    });
    await sofie.patch('/api/me/profile', { phone: '0470 12 34 56' }); // unchanged: no entry
    await sofie.patch('/api/me/profile', { phone: null });

    const log = await accountLog(sofieId);
    expect(log).toHaveLength(2);
    expect(log[0]).toMatchObject({
      organizationId: null,
      eventId: null,
      actorType: 'user',
      actorId: sofieId,
      action: 'updated',
      entityType: 'user',
      entityId: sofieId,
      changes: {
        name: null,
        phone: null,
        street: null,
        houseNumber: null,
        box: null,
        postalCode: null,
        city: null,
        country: null,
        birthDate: null,
      },
    });
    expect(log[1]!.changes).toEqual({ phone: null });
    const logged = JSON.stringify(log);
    for (const value of ['Janssens', '32470123456', 'Kerkstraat', 'Merkem', '8650', '1990']) {
      expect(logged).not.toContain(value);
    }
  });
});

describe('profile visibility', () => {
  let ownerId: string;
  let owner: TestClient;
  let mo: TestClient;
  let moId: string;

  beforeEach(async () => {
    owner = t.client();
    ownerId = (await owner.signUp('Olga Owner', 'olga@example.com')).id;
    const orgId = (await owner.createOrganization('KLJ Merkem')).id;
    await owner.patch('/api/me/profile', {
      phone: '0470 11 11 11',
      address: fullAddress,
      birthDate: '1980-01-01',
    });
    const joined = await t.inviteMember(owner, orgId, 'Mo Member', 'mo@example.com');
    mo = joined.client;
    moId = joined.user.id;
    await mo.patch('/api/me/profile', {
      phone: '0470 22 22 22',
      address: { ...fullAddress, houseNumber: '14' },
      birthDate: '2000-01-01',
    });
  });

  it('shows members of a shared organization only the phone', async () => {
    const res = await mo.get(`/api/users/${ownerId}/profile`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ userId: ownerId, name: 'Olga Owner', phone: '+32470111111' });
  });

  it('shows owners and admins of a shared organization the address and birth date too', async () => {
    const res = await owner.get(`/api/users/${moId}/profile`);
    expect(res.body).toEqual({
      userId: moId,
      name: 'Mo Member',
      phone: '+32470222222',
      address: { ...fullAddress, houseNumber: '14', country: 'BE' },
      birthDate: '2000-01-01',
    });
  });

  it('shows nothing to someone without a shared organization', async () => {
    const res = await sofie.get(`/api/users/${ownerId}/profile`);
    expect(res.status).toBe(404);
    expect((await sofie.get('/api/users/does-not-exist/profile')).status).toBe(404);
  });

  it('shows yourself everything', async () => {
    const res = await mo.get(`/api/users/${moId}/profile`);
    expect(res.body).toMatchObject({ phone: '+32470222222', birthDate: '2000-01-01' });
    expect(res.body.address).not.toBeNull();
  });
});

describe('changing the email', () => {
  it('only changes once the link sent to the new address is opened', async () => {
    t.emails.reset();
    const res = await sofie.post('/api/auth/change-email', { newEmail: 'sofie@new.example' });
    expect(res.status).toBe(200);

    const confirmation = t.emails.lastTo('sofie@new.example')!;
    expect(confirmation.subject).toBe('Bevestig je nieuwe e-mailadres');
    expect(t.emails.sent).toHaveLength(1);
    expect((await sofie.get('/api/me/profile')).body.email).toBe('sofie@example.com');

    expect((await openVerifyLink(t.client(), verifyToken('sofie@new.example'))).status).toBe(200);

    const profile = (await sofie.get('/api/me/profile')).body;
    expect(profile).toMatchObject({ email: 'sofie@new.example', emailVerified: true });
    const notice = t.emails.lastTo('sofie@example.com')!;
    expect(notice.subject).toBe('Je e-mailadres is gewijzigd');
    expect(notice.text).not.toContain('sofie@new.example');

    expect((await signIn('sofie@new.example')).status).toBe(200);
    expect((await signIn('sofie@example.com')).status).toBe(401);

    const log = await accountLog(sofieId);
    expect(log.map((entry) => [entry.action, entry.changes])).toEqual([
      ['email_change_requested', null],
      ['email_changed', { email: null }],
    ]);
    expect(log.every((entry) => entry.organizationId === null)).toBe(true);
    expect(JSON.stringify(log)).not.toContain('example');
  });

  it('works the same for an already verified address', async () => {
    await openVerifyLink(sofie, verifyToken('sofie@example.com'));
    await sofie.post('/api/auth/change-email', { newEmail: 'sofie@new.example' });
    await openVerifyLink(sofie, verifyToken('sofie@new.example'));

    expect((await sofie.get('/api/me/profile')).body).toMatchObject({
      email: 'sofie@new.example',
      emailVerified: true,
    });
    const actions = (await accountLog(sofieId)).map((entry) => entry.action);
    expect(actions).toEqual(['email_verified', 'email_change_requested', 'email_changed']);
  });

  it("doesn't reveal or take an address that already has an account", async () => {
    await t.client().signUp('Jan', 'jan@example.com');
    t.emails.reset();

    const res = await sofie.post('/api/auth/change-email', { newEmail: 'jan@example.com' });
    expect(res.status).toBe(200);
    expect(t.emails.sent).toHaveLength(0);
    expect((await sofie.get('/api/me/profile')).body.email).toBe('sofie@example.com');
  });
});

describe('changing the password', () => {
  it('needs the current password', async () => {
    const res = await sofie.post('/api/auth/change-password', {
      currentPassword: 'wrong-password-123',
      newPassword: 'a-brand-new-password',
    });
    expect(res.status).toBe(400);
    expect((await accountLog(sofieId)).map((e) => e.action)).not.toContain('password_changed');
  });

  it('signs out other devices, sends a notice and logs the change', async () => {
    const { client: laptop } = await signIn('sofie@example.com');
    t.emails.reset();

    const res = await sofie.post('/api/auth/change-password', {
      currentPassword: PASSWORD,
      newPassword: 'a-brand-new-password',
      revokeOtherSessions: true,
    });
    expect(res.status).toBe(200);

    expect((await sofie.get('/api/me/profile')).status).toBe(200);
    expect((await laptop.get('/api/me/profile')).status).toBe(401);
    expect((await signIn('sofie@example.com', 'a-brand-new-password')).status).toBe(200);

    expect(t.emails.lastTo('sofie@example.com')?.subject).toBe('Je wachtwoord is gewijzigd');
    const [entry] = await t.db
      .select()
      .from(activityLog)
      .where(and(eq(activityLog.action, 'password_changed'), isNull(activityLog.organizationId)));
    expect(entry).toMatchObject({
      entityType: 'user',
      entityId: sofieId,
      actorId: sofieId,
      changes: { password: null },
    });
  });

  it('can keep other devices signed in', async () => {
    const { client: laptop } = await signIn('sofie@example.com');
    await sofie.post('/api/auth/change-password', {
      currentPassword: PASSWORD,
      newPassword: 'a-brand-new-password',
      revokeOtherSessions: false,
    });
    expect((await laptop.get('/api/me/profile')).status).toBe(200);
  });
});

describe('organization history', () => {
  it('never includes account-level entries', async () => {
    const orgId = (await sofie.createOrganization('KLJ Merkem')).id;
    await sofie.patch('/api/me/profile', { phone: '0470 12 34 56' });

    const orgEntries = await t.db
      .select()
      .from(activityLog)
      .where(eq(activityLog.organizationId, orgId));
    expect(orgEntries.length).toBeGreaterThan(0);
    expect(orgEntries.some((entry) => entry.entityType === 'user')).toBe(false);
    expect(await accountLog(sofieId)).toHaveLength(1);
  });
});
