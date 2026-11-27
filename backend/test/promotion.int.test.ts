import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PromoActionPayload } from '../src/ai/ai.types.js';
import {
  activityLog,
  aiRun,
  aiSuggestion,
  budgetEntry,
  budgetEntryLabelLink,
  label,
  taskLabelLink,
} from '../src/db/schema/index.js';
import { createTestApp, type TestApp, type TestClient } from './test-app.js';

let t: TestApp;

// Mila counts as available, so her side of the tab shows; no model is ever called.
beforeAll(async () => {
  t = await createTestApp({ aiAvailable: true });
});
afterAll(() => t.close());
beforeEach(() => t.reset());

const DAY_MS = 24 * 60 * 60 * 1000;
const start = new Date(Date.now() + 40 * DAY_MS - 60 * 60 * 1000);
const at = (hoursAfterStart: number) =>
  new Date(start.getTime() + hoursAfterStart * 60 * 60 * 1000).toISOString();
const day = (daysFromToday: number) =>
  new Date(Date.now() + daysFromToday * DAY_MS).toISOString().slice(0, 10);

let admin: TestClient;
let adminId: string;
let orgId: string;
let eventId: string;

beforeEach(async () => {
  admin = t.client();
  adminId = (await admin.signUp('Ada Admin', 'ada@example.com')).id;
  orgId = (await admin.createOrganization('KLJ Merkem')).id;
  eventId = (await admin.createEvent({ startsAt: at(0), endsAt: at(9), expectedAttendance: 800 }))
    .id;
});

const url = (path: string, event = eventId) => `/api/events/${event}/${path}`;

const AUDIENCE = {
  audiences: ['families', 'neighbours'],
  description: 'Gezinnen uit de wijk',
  ageMin: null,
  ageMax: null,
  region: 'Gent',
  entryPriceCents: 0,
  pitch: 'De kerstman komt langs',
  promotionBudgetCents: 30000,
};

async function state(client = admin) {
  const res = await client.get(url('promotion'));
  if (res.status !== 200) throw new Error(`promotion failed: ${res.status} ${res.text}`);
  return res.body;
}

/** A promo action as a finished plan run would have saved it. */
async function seedSuggestion(overrides: Partial<PromoActionPayload> = {}) {
  const [run] = await t.db
    .insert(aiRun)
    .values({
      organizationId: orgId,
      eventId,
      feature: 'promotion_plan',
      trigger: 'on_demand',
      status: 'succeeded',
    })
    .returning();
  const payload: PromoActionPayload = {
    catalogKey: 'posters-local-shops',
    title: 'Affiches in lokale winkels',
    type: 'offline',
    audience: 'buurtbewoners',
    weeksBefore: 3,
    dueDate: day(19),
    estimatedCostCents: 8000,
    effort: 'medium',
    howTo: '1. Ontwerp de affiche.\n2. Hang ze op.',
    ...overrides,
  };
  const [row] = await t.db
    .insert(aiSuggestion)
    .values({
      organizationId: orgId,
      eventId,
      runId: run!.id,
      kind: 'promo_action',
      dedupKey: `promo:${payload.catalogKey}`,
      title: payload.title,
      explanation: 'Vorig jaar werkte het.',
      payload,
      citations: [{ type: 'catalog', id: 'posters-local-shops', label: 'Affiches' }],
    })
    .returning();
  return row!;
}

describe('Publiek', () => {
  it('starts empty and blocked, with Mila available to managers', async () => {
    expect(await state()).toMatchObject({
      audience: { audiences: [], pitch: null, promotionBudgetCents: null },
      sizeBand: 'M',
      guard: { state: 'blocked', blockedBy: 'audience', missing: ['pitch'], lastMinute: false },
      budget: { budgetCents: null, spentCents: 0, availableCents: null },
      tasks: [],
      metric: { suggested: 0, accepted: 0, done: 0 },
      mila: { enabled: true, run: null, suggestions: [] },
    });
  });

  it('saves the whole Publiek and logs it, the free texts by name only', async () => {
    const res = await admin.put(url('promotion/audience'), AUDIENCE);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(AUDIENCE);
    expect(await state()).toMatchObject({
      audience: AUDIENCE,
      guard: { state: 'ready', missing: [] },
      budget: { budgetCents: 30000, spentCents: 0, availableCents: 30000 },
    });

    const [entry] = await t.db
      .select()
      .from(activityLog)
      .where(eq(activityLog.entityType, 'event_audience'));
    expect(entry!.action).toBe('created');
    expect(JSON.stringify(entry!.changes)).not.toContain('kerstman');
  });

  it('refuses an age range upside down', async () => {
    const res = await admin.put(url('promotion/audience'), { ...AUDIENCE, ageMin: 30, ageMax: 12 });
    expect(res.status).toBe(400);
  });

  it('lets members read the tab, without Mila, but not change the Publiek', async () => {
    const { client: member } = await t.inviteMember(admin, orgId, 'Mo Member', 'mo@example.com');
    expect((await state(member)).mila).toBeNull();
    expect((await member.put(url('promotion/audience'), AUDIENCE)).status).toBe(403);
  });

  it('is copied to the next edition', async () => {
    await admin.put(url('promotion/audience'), AUDIENCE);
    const next = await admin.createEvent({
      name: 'Kerstmarkt 2027',
      startsAt: new Date(start.getTime() + 365 * DAY_MS).toISOString(),
      endsAt: new Date(start.getTime() + 365 * DAY_MS + 9 * 3600_000).toISOString(),
      previousEditionId: eventId,
    });
    const res = await admin.get(url('promotion', next.id));
    expect(res.body.audience).toEqual(AUDIENCE);
    const logged = await t.db
      .select()
      .from(activityLog)
      .where(and(eq(activityLog.eventId, next.id), eq(activityLog.entityType, 'event_audience')));
    expect(logged.map((entry) => entry.action)).toEqual(['created']);
  });
});

describe('own promotion actions', () => {
  it('adds a Promotie task, creating the label once, that shows on the timeline', async () => {
    const res = await admin.post(url('promotion/tasks'), {
      title: 'Flyers in de bakkerij',
      dueDate: day(10),
    });
    expect(res.status).toBe(201);
    const again = await admin.post(url('promotion/tasks'), { title: 'Post in de buurtgroep' });
    expect(again.status).toBe(201);

    const labels = await t.db.select().from(label).where(eq(label.eventId, eventId));
    expect(labels.map((row) => row.name)).toEqual(['Promotie']);
    const links = await t.db
      .select()
      .from(taskLabelLink)
      .where(eq(taskLabelLink.taskId, res.body.id));
    expect(links.map((link) => link.labelId)).toEqual([labels[0]!.id]);

    const body = await state();
    expect(body.tasks.map((task: { title: string }) => task.title).toSorted()).toEqual([
      'Flyers in de bakkerij',
      'Post in de buurtgroep',
    ]);
    expect(body.tasks.every((task: { fromMila: boolean }) => !task.fromMila)).toBe(true);
  });

  it('is only for managers', async () => {
    const { client: member } = await t.inviteMember(admin, orgId, 'Mo Member', 'mo@example.com');
    expect((await member.post(url('promotion/tasks'), { title: 'Affiches' })).status).toBe(403);
  });
});

describe('promotion plan', () => {
  it('cannot be asked for without an audience', async () => {
    const res = await admin.post(url('ai/promotion-plan'), {});
    expect(res.status).toBe(409);
    expect(res.text).toContain('promotion: audience');
  });

  it('accepts an action as a Promotie task with a linked estimated expense', async () => {
    await admin.put(url('promotion/audience'), AUDIENCE);
    const suggestion = await seedSuggestion();
    expect((await state()).mila.suggestions).toMatchObject([
      { id: suggestion.id, kind: 'promo_action', payload: { estimatedCostCents: 8000 } },
    ]);

    const res = await admin.post(url('ai/promotion-plan/accept'), {
      items: [
        {
          suggestionId: suggestion.id,
          task: { title: 'Affiches ophangen', description: '1. Ontwerp', dueDate: day(19) },
          addBudgetLine: true,
        },
      ],
    });
    expect(res.status).toBe(204);

    // The Promotie label was made, purple, and carries the task and the expense.
    const [promotie] = await t.db.select().from(label).where(eq(label.eventId, eventId));
    expect(promotie).toMatchObject({ name: 'Promotie', color: 'purple' });
    const body = await state();
    expect(body.tasks).toMatchObject([
      { title: 'Affiches ophangen', dueDate: day(19), fromMila: true, status: 'todo' },
    ]);
    const taskId = body.tasks[0].id as string;
    const links = await t.db.select().from(taskLabelLink).where(eq(taskLabelLink.taskId, taskId));
    expect(links.map((link) => link.labelId)).toEqual([promotie!.id]);

    const [expense] = await t.db.select().from(budgetEntry).where(eq(budgetEntry.eventId, eventId));
    expect(expense).toMatchObject({
      type: 'expense',
      title: 'Affiches ophangen',
      estimatedCents: 8000,
      actualCents: null,
      taskId,
      createdByUserId: adminId,
    });
    const expenseLabels = await t.db
      .select()
      .from(budgetEntryLabelLink)
      .where(eq(budgetEntryLabelLink.budgetEntryId, expense!.id));
    expect(expenseLabels.map((link) => link.labelId)).toEqual([promotie!.id]);

    // The planned expense now counts against the budget, and the action is no longer pending.
    expect(body).toMatchObject({
      budget: { budgetCents: 30000, spentCents: 8000, availableCents: 22000 },
      metric: { suggested: 1, accepted: 1, done: 0 },
      mila: { suggestions: [] },
    });

    // Task, label and expense have the suggestion as their source.
    const sourced = await t.db
      .select()
      .from(activityLog)
      .where(
        and(eq(activityLog.sourceType, 'ai_suggestion'), eq(activityLog.sourceId, suggestion.id)),
      );
    expect(sourced.map((row) => row.entityType).sort()).toEqual(['budget_entry', 'label', 'task']);

    // Done counts in the pilot metric.
    expect((await admin.patch(url(`tasks/${taskId}`), { status: 'done' })).status).toBe(200);
    expect((await state()).metric).toEqual({ suggested: 1, accepted: 1, done: 1 });
  });

  it('adds no budget line unless asked, and reuses an existing Promotie label', async () => {
    const existing = await admin.post(url('labels'), { name: 'promotie', color: 'blue' });
    const suggestion = await seedSuggestion();
    const res = await admin.post(url('ai/promotion-plan/accept'), {
      items: [{ suggestionId: suggestion.id, task: { title: 'Affiches' }, addBudgetLine: false }],
    });
    expect(res.status).toBe(204);
    expect(await t.db.select().from(label).where(eq(label.eventId, eventId))).toHaveLength(1);
    expect(await t.db.select().from(budgetEntry).where(eq(budgetEntry.eventId, eventId))).toEqual(
      [],
    );
    const [task] = (await state()).tasks;
    const links = await t.db.select().from(taskLabelLink).where(eq(taskLabelLink.taskId, task.id));
    expect(links.map((link) => link.labelId)).toEqual([existing.body.id]);
  });

  it('accepts an action only once, and only for managers', async () => {
    const suggestion = await seedSuggestion();
    const body = {
      items: [{ suggestionId: suggestion.id, task: { title: 'Affiches' }, addBudgetLine: false }],
    };
    const { client: member } = await t.inviteMember(admin, orgId, 'Mo Member', 'mo@example.com');
    expect((await member.post(url('ai/promotion-plan/accept'), body)).status).toBe(403);
    expect((await admin.post(url('ai/promotion-plan/accept'), body)).status).toBe(204);
    expect((await admin.post(url('ai/promotion-plan/accept'), body)).status).toBe(409);
  });

  it('shows on the overview: a CTA without a plan, red when a Promotie task is overdue', async () => {
    let res = await admin.get(url('overview'));
    expect(res.body.promotion).toMatchObject({
      status: 'neutral',
      open: 0,
      next: null,
      hasPlan: false,
    });

    const suggestion = await seedSuggestion();
    await admin.post(url('ai/promotion-plan/accept'), {
      items: [
        {
          suggestionId: suggestion.id,
          task: { title: 'Affiches', dueDate: day(-1) },
          addBudgetLine: false,
        },
      ],
    });
    res = await admin.get(url('overview'));
    expect(res.body.promotion).toMatchObject({
      status: 'bad',
      open: 1,
      overdue: 1,
      done: 0,
      next: { title: 'Affiches', dueDate: day(-1), overdue: true },
      hasPlan: true,
      pendingActions: 0,
    });
  });
});
