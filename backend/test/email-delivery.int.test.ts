import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { activityLog, emailDelivery, invitation } from '../src/db/schema/index.js';
import { EmailDeliveryError, EmailService } from '../src/email/email.service.js';
import { createTestApp, type TestApp, type TestClient } from './test-app.js';

let t: TestApp;
let emailService: EmailService;

beforeAll(async () => {
  t = await createTestApp();
  emailService = t.app.get(EmailService);
});
afterAll(() => t.close());
beforeEach(() => t.reset());

let owner: TestClient;
let orgId: string;

beforeEach(async () => {
  owner = t.client();
  await owner.signUp('Olga Owner', 'olga@example.com');
  orgId = (await owner.createOrganization('KLJ Merkem')).id;
});

const invite = (email: string, role = 'member') =>
  owner.post('/api/auth/organization/invite-member', { email, role });

const deliveries = () => t.db.select().from(emailDelivery).orderBy(emailDelivery.createdAt);

/** A send outside any request, as a future job worker would do it. */
const sendInvitation = (idempotencyKey: string) =>
  emailService.send({
    template: 'organization-invitation',
    to: 'direct@example.com',
    props: {
      inviterName: 'Olga Owner',
      organizationName: 'KLJ Merkem',
      role: 'member',
      acceptUrl: 'http://localhost:3000/invitations/x',
      expiresAt: new Date(),
    },
    idempotencyKey,
  });

describe('organization invitation email', () => {
  it('is rendered from the React template, sent once and logged as sent', async () => {
    const res = await invite('newbie@example.com', 'admin');
    expect(res.status).toBe(200);
    const invitationId = res.body.id as string;

    const email = t.emails.lastTo('newbie@example.com')!;
    expect(email.subject).toBe('Olga Owner nodigt je uit voor KLJ Merkem op VolunteerOS');
    expect(email.html).toContain(`href="http://localhost:3000/invitations/${invitationId}"`);
    expect(email.text).toContain('beheerder');
    expect(email.idempotencyKey).toBe(`organization-invitation:${invitationId}`);

    const [row] = await deliveries();
    expect(row).toMatchObject({
      organizationId: orgId,
      eventId: null,
      recipient: 'newbie@example.com',
      template: 'organization-invitation',
      subject: email.subject,
      status: 'sent',
      idempotencyKey: `organization-invitation:${invitationId}`,
      providerMessageId: 'test-message-1',
      attempts: 1,
      lastError: null,
    });
    expect(row!.sentAt).toBeInstanceOf(Date);
    const [stored] = await t.db.select().from(invitation).where(eq(invitation.id, invitationId));
    expect(stored!.status).toBe('pending');
  });

  it('a re-invite is a new invitation, so it sends a new email', async () => {
    const first = await invite('late@example.com');
    const second = await invite('late@example.com');
    expect(second.body.id).not.toBe(first.body.id);

    expect(t.emails.sent).toHaveLength(2);
    expect((await deliveries()).map((d) => d.idempotencyKey)).toEqual([
      `organization-invitation:${first.body.id}`,
      `organization-invitation:${second.body.id}`,
    ]);
  });

  it('retries temporary provider errors and logs how many attempts it took', async () => {
    t.emails.failNext(2, { retryable: true });

    expect((await invite('flaky@example.com')).status).toBe(200);

    expect(t.emails.calls).toBe(3);
    expect(t.emails.sent).toHaveLength(1);
    const [row] = await deliveries();
    expect(row).toMatchObject({ status: 'sent', attempts: 3, lastError: null });
  });

  it('fails the invite when the email cannot be sent, cancels it, and logs the failure', async () => {
    t.emails.failNext(3, { retryable: true });

    const res = await invite('unlucky@example.com');
    expect(res.status).toBe(502);
    expect(res.body.code).toBe('INVITATION_EMAIL_FAILED');

    const invitations = await t.db
      .select({ id: invitation.id, status: invitation.status })
      .from(invitation)
      .where(eq(invitation.email, 'unlucky@example.com'));
    expect(invitations).toEqual([{ id: expect.any(String), status: 'canceled' }]);
    const history = await t.db
      .select({ action: activityLog.action })
      .from(activityLog)
      .where(eq(activityLog.entityId, invitations[0]!.id))
      .orderBy(activityLog.createdAt);
    expect(history.map((h) => h.action)).toEqual(['invited', 'cancelled']);

    expect(t.emails.calls).toBe(3);
    const [row] = await deliveries();
    expect(row).toMatchObject({
      recipient: 'unlucky@example.com',
      status: 'failed',
      attempts: 3,
      lastError: 'simulated provider failure',
    });
  });

  it('does not retry errors that will fail the same way again', async () => {
    t.emails.failNext(1, { retryable: false });

    expect((await invite('invalid@example.com')).status).toBe(502);

    expect(t.emails.calls).toBe(1);
    expect((await deliveries())[0]).toMatchObject({ status: 'failed', attempts: 1 });
  });
});

describe('idempotency', () => {
  it('never sends the same key twice', async () => {
    const first = await sendInvitation('test:same-key');
    const second = await sendInvitation('test:same-key');

    expect(first.outcome).toBe('sent');
    expect(second).toEqual({ deliveryId: first.deliveryId, outcome: 'already-sent' });
    expect(t.emails.sent).toHaveLength(1);
    expect(await deliveries()).toHaveLength(1);
  });

  it('sends a concurrent duplicate only once', async () => {
    const results = await Promise.all([
      sendInvitation('test:concurrent'),
      sendInvitation('test:concurrent'),
      sendInvitation('test:concurrent'),
    ]);

    expect(results.filter((r) => r.outcome === 'sent')).toHaveLength(1);
    expect(t.emails.sent).toHaveLength(1);
  });

  it('a failed key can be sent again later, on the same delivery row', async () => {
    t.emails.failNext(3, { retryable: true });
    const failed = await sendInvitation('test:later').catch((error: unknown) => error);
    expect(failed).toBeInstanceOf(EmailDeliveryError);

    const retried = await sendInvitation('test:later');

    expect(retried).toEqual({
      deliveryId: (failed as EmailDeliveryError).deliveryId,
      outcome: 'sent',
    });
    const [row] = await deliveries();
    expect(row).toMatchObject({ status: 'sent', attempts: 4, lastError: null });
  });

  it('takes over a pending send that was abandoned, but not one still in progress', async () => {
    const [inFlight] = await t.db
      .insert(emailDelivery)
      .values({
        recipient: 'direct@example.com',
        template: 'organization-invitation',
        subject: 'x',
        idempotencyKey: 'test:pending',
      })
      .returning();

    expect(await sendInvitation('test:pending')).toEqual({
      deliveryId: inFlight!.id,
      outcome: 'in-progress',
    });
    expect(t.emails.sent).toHaveLength(0);

    await t.db
      .update(emailDelivery)
      .set({ updatedAt: new Date(Date.now() - 5 * 60_000) })
      .where(eq(emailDelivery.id, inFlight!.id));

    expect(await sendInvitation('test:pending')).toEqual({
      deliveryId: inFlight!.id,
      outcome: 'sent',
    });
    expect(t.emails.sent).toHaveLength(1);
  });
});

describe('password reset email', () => {
  it('is logged without the reset token itself', async () => {
    const res = await t.client().post('/api/auth/request-password-reset', {
      email: 'olga@example.com',
      redirectTo: '/reset-password',
    });
    expect(res.status).toBe(200);

    const email = t.emails.lastTo('olga@example.com')!;
    const token = decodeURIComponent(email.text.match(/reset-password\?token=(\S+)/)![1]!);
    const [row] = await deliveries();
    expect(row).toMatchObject({
      template: 'password-reset',
      organizationId: null,
      status: 'sent',
      idempotencyKey: `password-reset:${createHash('sha256').update(token).digest('hex')}`,
    });
    expect(JSON.stringify(row)).not.toContain(token);
  });
});
