import type { INestApplication } from '@nestjs/common';
import { getDrizzleToken } from '@nestjs/drizzle';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import type { Database } from '../src/db/database.js';
import {
  EmailProvider,
  EmailProviderError,
  type OutgoingEmail,
  type ProviderResult,
} from '../src/email/email-provider.js';
import { EMAIL_RETRY_DELAYS_MS } from '../src/email/email.service.js';
import { TEST_APP_URL, TEST_INTERNAL_SECRET } from './env.js';

/**
 * Captures emails instead of sending them, so tests can read invitation links. `failNext` makes
 * the next provider calls fail, to exercise retries.
 */
export class CapturingEmailProvider extends EmailProvider {
  readonly sent: OutgoingEmail[] = [];
  /** Every provider call, including failed ones. */
  calls = 0;
  private failures: EmailProviderError[] = [];

  async send(email: OutgoingEmail): Promise<ProviderResult> {
    this.calls++;
    const failure = this.failures.shift();
    if (failure) throw failure;
    this.sent.push(email);
    return { providerMessageId: `test-message-${this.sent.length}` };
  }

  failNext(times: number, { retryable }: { retryable: boolean }) {
    for (let i = 0; i < times; i++) {
      this.failures.push(new EmailProviderError('simulated provider failure', retryable));
    }
  }

  lastTo(email: string): OutgoingEmail | undefined {
    return this.sent.findLast((message) => message.to === email);
  }

  reset() {
    this.sent.length = 0;
    this.calls = 0;
    this.failures = [];
  }
}

export interface TestApp {
  app: INestApplication;
  db: Database;
  emails: CapturingEmailProvider;
  /** A cookie-keeping client that acts like the Next.js server: it sends the internal secret. */
  client: () => TestClient;
  /** The admin invites `email` as a member; the invitee signs up, accepts and activates the org. */
  inviteMember: (
    admin: TestClient,
    organizationId: string,
    name: string,
    email: string,
  ) => Promise<{ client: TestClient; user: { id: string; email: string }; invitationId: string }>;
  reset: () => Promise<void>;
  close: () => Promise<void>;
}

export async function createTestApp(): Promise<TestApp> {
  const emails = new CapturingEmailProvider();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(EmailProvider)
    .useValue(emails)
    .overrideProvider(EMAIL_RETRY_DELAYS_MS)
    .useValue([0, 0])
    .compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>({
    bodyParser: false,
    logger: false,
  });
  configureApp(app);
  await app.init();

  const db = app.get<Database>(getDrizzleToken());
  return {
    app,
    db,
    emails,
    client: () => new TestClient(app),
    inviteMember: async (admin, organizationId, name, email) => {
      const invite = await admin.post('/api/auth/organization/invite-member', {
        email,
        role: 'member',
      });
      if (invite.status !== 200) throw new Error(`invite failed: ${invite.status} ${invite.text}`);
      const invitationId = invite.body.id as string;
      if (!emails.lastTo(email)?.text.includes(`/invitations/${invitationId}`)) {
        throw new Error(`no invitation email with a link to ${invitationId}`);
      }

      const invitee = new TestClient(app);
      const user = await invitee.signUp(name, email);
      const accept = await invitee.post('/api/auth/organization/accept-invitation', {
        invitationId,
      });
      if (accept.status !== 200) throw new Error(`accept failed: ${accept.status} ${accept.text}`);
      await invitee.setActiveOrganization(organizationId);
      return { client: invitee, user, invitationId };
    },
    reset: async () => {
      emails.reset();
      await db.execute(sql`
        truncate table email_delivery, activity_log, task_assignment_request, task_label_link,
          task_label, task, event_member, event, invitation, member, organization,
          session, account, verification, "user" restart identity cascade
      `);
    },
    close: () => app.close(),
  };
}

type Method = 'get' | 'post' | 'patch' | 'delete';

export class TestClient {
  private readonly agent: ReturnType<typeof request.agent>;

  constructor(app: INestApplication) {
    this.agent = request.agent(app.getHttpServer());
  }

  request(method: Method, path: string, body?: object, { secret = TEST_INTERNAL_SECRET } = {}) {
    let req = this.agent[method](path).set('origin', TEST_APP_URL);
    if (secret) {
      req = req.set('x-internal-secret', secret);
    }
    return body ? req.send(body) : req;
  }

  get = (path: string) => this.request('get', path);
  post = (path: string, body?: object) => this.request('post', path, body ?? {});
  patch = (path: string, body: object) => this.request('patch', path, body);
  delete = (path: string) => this.request('delete', path);

  async signUp(name: string, email: string) {
    const res = await this.post('/api/auth/sign-up/email', {
      name,
      email,
      password: 'correct-horse-battery',
    });
    if (res.status !== 200) throw new Error(`sign-up failed: ${res.status} ${res.text}`);
    return res.body.user as { id: string; email: string };
  }

  /** Creates an organization (the caller becomes owner) and makes it the active one. */
  async createOrganization(name: string) {
    const slug = `${name.toLowerCase().replace(/\W+/g, '-')}-${Math.random().toString(36).slice(2, 8)}`;
    const res = await this.post('/api/auth/organization/create', { name, slug });
    if (res.status !== 200) throw new Error(`create org failed: ${res.status} ${res.text}`);
    await this.setActiveOrganization(res.body.id);
    return res.body as { id: string };
  }

  async setActiveOrganization(organizationId: string) {
    const res = await this.post('/api/auth/organization/set-active', { organizationId });
    if (res.status !== 200) throw new Error(`set-active failed: ${res.status} ${res.text}`);
  }

  async createEvent(overrides: Record<string, unknown> = {}) {
    const res = await this.post('/api/events', {
      name: 'Kerstmarkt 2026',
      eventType: 'market',
      startsAt: '2026-12-12T14:00:00+01:00',
      endsAt: '2026-12-12T23:00:00+01:00',
      ...overrides,
    });
    if (res.status !== 201) throw new Error(`create event failed: ${res.status} ${res.text}`);
    return res.body as { id: string; status: string; previousEditionId: string | null };
  }
}
