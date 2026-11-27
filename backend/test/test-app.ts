import type { INestApplication } from '@nestjs/common';
import { getDrizzleToken } from '@nestjs/drizzle';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { LanguageModel } from 'ai';
import { sql } from 'drizzle-orm';
import { MockLanguageModelV4 } from 'ai/test';
import request from 'supertest';
import { AI_MODEL_RESOLVER, type AiModelResolver } from '../src/ai/ai-models.js';
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
import { FileStorage } from '../src/storage/file-storage.js';
import { TEST_APP_URL, TEST_INTERNAL_SECRET } from './env.js';
import { FakeFileStorage } from './fake-file-storage.js';

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
  files: FakeFileStorage;
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

/** What a scripted model sees of one call. */
export interface ModelCall {
  system: string;
  prompt: string;
}

/**
 * - `aiAvailable`: Mila counts as available (as with an API key), so her hints show. No model is
 *   ever called: resolving one throws, and nothing queues runs in tests.
 * - `respond`: Mila is available and every model call answers with what this returns (as JSON),
 *   so a test can drive a runner or a drafting call end to end. Runs are still not queued: tests
 *   insert the run and hand it to the worker.
 * - `model`: a mock model every feature uses, for tests that execute a run themselves.
 */
export async function createTestApp(
  options: {
    aiAvailable?: boolean;
    respond?: (call: ModelCall) => unknown;
    /** A mock model (`ai/test`) every feature uses: Mila is available and her runs can execute. */
    model?: LanguageModel;
  } = {},
): Promise<TestApp> {
  const emails = new CapturingEmailProvider();
  const files = new FakeFileStorage();
  let builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(EmailProvider)
    .useValue(emails)
    .overrideProvider(EMAIL_RETRY_DELAYS_MS)
    .useValue([0, 0])
    .overrideProvider(FileStorage)
    .useValue(files);
  if (options.respond) {
    const respond = options.respond;
    const resolver: AiModelResolver = {
      enabled: true,
      resolve: () =>
        new MockLanguageModelV4({
          doGenerate: async ({ prompt }) => {
            const text = (role: string) =>
              prompt
                .filter((message) => message.role === role)
                .flatMap((message) =>
                  typeof message.content === 'string'
                    ? [message.content]
                    : message.content.flatMap((part) => (part.type === 'text' ? [part.text] : [])),
                )
                .join('\n');
            const output = respond({ system: text('system'), prompt: text('user') });
            return {
              content: [{ type: 'text', text: JSON.stringify(output) }],
              finishReason: { unified: 'stop', raw: 'stop' },
              usage: {
                inputTokens: { total: 100, noCache: 100, cacheRead: 0, cacheWrite: 0 },
                outputTokens: { total: 50, text: 50, reasoning: 0 },
              },
              warnings: [],
            };
          },
        }),
    };
    builder = builder.overrideProvider(AI_MODEL_RESOLVER).useValue(resolver);
  } else if (options.aiAvailable || options.model) {
    const { model } = options;
    const resolver: AiModelResolver = {
      enabled: true,
      resolve: () => {
        if (model) return model;
        throw new Error('Tests never call a model');
      },
    };
    builder = builder.overrideProvider(AI_MODEL_RESOLVER).useValue(resolver);
  }
  const moduleRef = await builder.compile();

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
    files,
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
      files.reset();
      await db.execute(sql`
        truncate table event_upload, task_upload, budget_entry_upload, upload,
          budget_entry_label_link, budget_entry, supplier, email_delivery, activity_log, assignment, volunteer_application, volunteer, shift,
          team, task_assignment_request, task_label_link,
          label, task, event_member, event, invitation, member, organization,
          session, account, verification, user_profile, "user" restart identity cascade
      `);
    },
    close: () => app.close(),
  };
}

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

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
  put = (path: string, body: object) => this.request('put', path, body);
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
  async createOrganization(name: string, profile: Record<string, unknown> = {}) {
    const slug = `${name.toLowerCase().replace(/\W+/g, '-')}-${Math.random().toString(36).slice(2, 8)}`;
    const res = await this.post('/api/auth/organization/create', {
      name,
      slug,
      category: 'youth_movement',
      ...profile,
    });
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
