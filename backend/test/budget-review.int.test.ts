import { MockLanguageModelV4 } from 'ai/test';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { BudgetReviewOutput } from '../src/ai/budget-review/budget-review.schema.js';
import { AiRunWorker } from '../src/ai/runs/ai-run-worker.service.js';
import { activityLog, aiRun, aiSuggestion } from '../src/db/schema/index.js';
import { createTestApp, type TestApp, type TestClient } from './test-app.js';

/**
 * "Mila, bekijk mijn begroting" end to end: a run with a mock model, the planned suggestions in
 * the API, the overview's hint, accepting and rejecting lines, and a second run.
 */

/** What the mock model answers; each test sets it before running. */
let modelOutput: BudgetReviewOutput;
const model = new MockLanguageModelV4({
  doGenerate: async () => ({
    content: [{ type: 'text', text: JSON.stringify(modelOutput) }],
    finishReason: { unified: 'stop', raw: undefined },
    usage: {
      inputTokens: { total: 1000, noCache: 1000, cacheRead: 0, cacheWrite: 0 },
      outputTokens: { total: 200, text: 200, reasoning: 0 },
    },
    warnings: [],
  }),
});

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp({ model });
});
afterAll(() => t.close());
beforeEach(() => t.reset());

const DAY_MS = 24 * 60 * 60 * 1000;
const inDays = (days: number, hour = 14) =>
  new Date(Date.now() + days * DAY_MS + hour * 60 * 60 * 1000).toISOString();

let admin: TestClient;
let orgId: string;
let eventId: string;
let previousId: string;
let barLabelId: string;
let peetersId: string;
let taskId: string;

async function expectStatus(res: { status: number; text: string }, status: number) {
  if (res.status !== status) throw new Error(`expected ${status}, got ${res.status} ${res.text}`);
}

async function post(path: string, body: object) {
  const res = await admin.post(`/api${path}`, body);
  await expectStatus(res, 201);
  return res.body as { id: string };
}

beforeEach(async () => {
  admin = t.client();
  await admin.signUp('Ada Admin', 'ada@example.com');
  orgId = (await admin.createOrganization('Chiro Sint-Jan')).id;
  previousId = (
    await admin.createEvent({
      name: 'Kerstmarkt 2025',
      startsAt: inDays(-340),
      endsAt: inDays(-340, 22),
      actualAttendance: 720,
    })
  ).id;
  eventId = (
    await admin.createEvent({
      name: 'Kerstmarkt 2026',
      startsAt: inDays(25),
      endsAt: inDays(25, 22),
      previousEditionId: previousId,
      expectedAttendance: 800,
    })
  ).id;

  peetersId = (await post('/suppliers', { name: 'Drankenhandel Peeters', category: 'drinks' })).id;
  const previousBar = await post(`/events/${previousId}/labels`, { name: 'Bar', color: 'orange' });
  barLabelId = (await post(`/events/${eventId}/labels`, { name: 'bar', color: 'orange' })).id;
  await post(`/events/${previousId}/budget-entries`, {
    type: 'expense',
    title: 'Glühwein en drank',
    estimatedCents: 80_000,
    actualCents: 78_230,
    supplierId: peetersId,
    labelIds: [previousBar.id],
  });
  await post(`/events/${previousId}/budget-entries`, {
    type: 'expense',
    title: 'Verzekering BA organisator',
    actualCents: 18_500,
  });
  await post(`/events/${eventId}/budget-entries`, {
    type: 'expense',
    title: 'Tenten huren',
    estimatedCents: 90_000,
  });
  taskId = (await post(`/events/${eventId}/tasks`, { title: 'Springkasteel reserveren' })).id;

  modelOutput = {
    previousLines: [],
    checklist: [],
    lines: [
      {
        type: 'expense',
        title: 'Glühwein en drank',
        origin: 'previous_edition',
        amountRef: 'P1',
        taskRef: null,
        reason: 'Vorig jaar had je dit ook.',
        cites: ['P1'],
      },
      {
        type: 'expense',
        title: 'Springkasteel',
        origin: 'task',
        amountRef: null,
        taskRef: 'T1',
        reason: 'Je taak kost geld.',
        cites: ['T1'],
      },
      {
        type: 'expense',
        title: 'Unisono',
        origin: 'checklist',
        amountRef: 'C1',
        taskRef: null,
        reason: 'Muziek op de markt.',
        cites: ['C1'],
      },
      // Already in the budget: dropped by the planner.
      {
        type: 'expense',
        title: 'Tenten huren',
        origin: 'typical',
        amountRef: null,
        taskRef: null,
        reason: 'Nodig.',
        cites: ['E'],
      },
    ],
    insight: { headline: 'Je houdt geld over.', explanation: 'De tent blijft even duur.' },
  };
});

const aiUrl = (path = '') => `/api/events/${eventId}/ai${path}`;

/** Runs a budget review the way the job queue would. */
async function runReview() {
  const [run] = await t.db
    .insert(aiRun)
    .values({
      organizationId: orgId,
      eventId,
      feature: 'budget_review',
      trigger: 'on_demand',
    })
    .returning();
  await t.app.get(AiRunWorker).handle({ runId: run!.id });
  const [after] = await t.db.select().from(aiRun).where(eq(aiRun.id, run!.id));
  return after!;
}

async function pending() {
  const res = await admin.get(aiUrl());
  await expectStatus(res, 200);
  return res.body.suggestions as {
    id: string;
    kind: string;
    title: string;
    payload: Record<string, unknown>;
  }[];
}

describe('budget review', () => {
  it('refuses to queue a review while AI is off', async () => {
    // The test environment has no API key, so nothing is queued.
    expect((await admin.post(aiUrl('/budget-review'))).status).toBe(409);
  });

  it('proposes missing lines with backed estimates and an insight', async () => {
    const run = await runReview();
    expect(run).toMatchObject({ status: 'succeeded', promptVersion: 'budget-review@2' });

    const suggestions = await pending();
    const lines = suggestions.filter((s) => s.kind === 'budget_line');
    expect(lines.map((s) => s.title).sort()).toEqual([
      'Glühwein en drank',
      'Springkasteel',
      'Unisono',
    ]);
    expect(lines.find((s) => s.title === 'Glühwein en drank')!.payload).toMatchObject({
      origin: 'previous_edition',
      // € 782,30 at 720 visitors → ~€ 870 at 800.
      estimate: { basis: 'previous_edition', cents: 87_000, scaled: true, targetAttendance: 800 },
      labelIds: [barLabelId],
      supplier: { id: peetersId, name: 'Drankenhandel Peeters' },
    });
    expect(lines.find((s) => s.title === 'Springkasteel')!.payload).toMatchObject({
      origin: 'task',
      estimate: null,
      task: { id: taskId, title: 'Springkasteel reserveren' },
    });
    expect(lines.find((s) => s.title === 'Unisono')!.payload).toMatchObject({
      origin: 'checklist',
      estimate: { basis: 'richtprijs', checklistKey: 'unisono' },
    });

    const insight = suggestions.find((s) => s.kind === 'budget_insight')!;
    expect(insight).toMatchObject({
      title: 'Je houdt geld over.',
      payload: {
        basis: 'current',
        expenseCents: 90_000,
        expectedAttendance: 800,
        previousEdition: { name: 'Kerstmarkt 2025', attendance: 720 },
      },
    });

    const overview = (await admin.get(`/api/events/${eventId}/overview`)).body;
    expect(overview.mila).toMatchObject({
      reviewingBudget: false,
      pendingBudgetLines: 3,
      pendingBudgetLinesFromPreviousEdition: 1,
    });
    expect(overview.mila.hints).toContainEqual(
      expect.objectContaining({ key: 'budget.review', card: 'budget' }),
    );
  });

  it('adds accepted lines through the budget, with the suggestion as their source', async () => {
    await runReview();
    const lines = (await pending()).filter((s) => s.kind === 'budget_line');
    const gluhwein = lines.find((s) => s.title === 'Glühwein en drank')!;
    const unisono = lines.find((s) => s.title === 'Unisono')!;

    const accept = await admin.post(aiUrl('/suggestions/accept-budget-lines'), {
      items: [
        {
          suggestionId: gluhwein.id,
          entry: {
            type: 'expense',
            title: 'Glühwein en drank',
            estimatedCents: 87_000,
            labelIds: [barLabelId],
            supplierId: peetersId,
          },
        },
        // Edited in the form first.
        {
          suggestionId: unisono.id,
          entry: { type: 'expense', title: 'Unisono muziek', estimatedCents: 15_000 },
        },
      ],
    });
    await expectStatus(accept, 204);

    const budget = (await admin.get(`/api/events/${eventId}/budget-entries`)).body as {
      title: string;
      estimatedCents: number | null;
      actualCents: number | null;
      labelIds: string[];
      supplier: { id: string } | null;
    }[];
    expect(budget.find((e) => e.title === 'Glühwein en drank')).toMatchObject({
      estimatedCents: 87_000,
      actualCents: null,
      labelIds: [barLabelId],
      supplier: { id: peetersId },
    });
    expect(budget.find((e) => e.title === 'Unisono muziek')).toMatchObject({
      estimatedCents: 15_000,
    });

    const logged = await t.db
      .select()
      .from(activityLog)
      .where(
        and(
          eq(activityLog.entityType, 'budget_entry'),
          eq(activityLog.sourceType, 'ai_suggestion'),
          eq(activityLog.sourceId, gluhwein.id),
        ),
      );
    expect(logged).toHaveLength(1);

    // Decided once: a second accept is a conflict and creates nothing.
    const again = await admin.post(aiUrl('/suggestions/accept-budget-lines'), {
      items: [
        {
          suggestionId: gluhwein.id,
          entry: { type: 'expense', title: 'Nog eens', estimatedCents: 1 },
        },
      ],
    });
    expect(again.status).toBe(409);
    const after = (await admin.get(`/api/events/${eventId}/budget-entries`)).body as {
      title: string;
    }[];
    expect(after.map((e) => e.title)).not.toContain('Nog eens');
  });

  it('never brings back a rejected line, and replaces the insight on every run', async () => {
    await runReview();
    const springkasteel = (await pending()).find((s) => s.title === 'Springkasteel')!;
    await expectStatus(await admin.post(aiUrl(`/suggestions/${springkasteel.id}/reject`)), 204);
    // Meanwhile the organizer added Unisono by hand.
    await post(`/events/${eventId}/budget-entries`, {
      type: 'expense',
      title: 'Unisono',
      estimatedCents: 20_000,
    });

    modelOutput = { ...modelOutput, insight: { headline: 'Nieuw inzicht.', explanation: '…' } };
    await runReview();

    const suggestions = await pending();
    expect(suggestions.filter((s) => s.kind === 'budget_line').map((s) => s.title)).toEqual([
      'Glühwein en drank',
    ]);
    const insights = await t.db
      .select()
      .from(aiSuggestion)
      .where(and(eq(aiSuggestion.eventId, eventId), eq(aiSuggestion.kind, 'budget_insight')));
    expect(insights).toHaveLength(1);
    expect(insights[0]).toMatchObject({ title: 'Nieuw inzicht.', status: 'pending' });
    // The insight now counts the line added by hand.
    expect(insights[0]!.payload).toMatchObject({ expenseCents: 110_000 });
  });

  it('offers a draft on the overview when the budget is empty', async () => {
    const empty = (
      await admin.createEvent({
        name: 'Spaghettiavond',
        startsAt: inDays(60),
        endsAt: inDays(60, 22),
      })
    ).id;
    const overview = (await admin.get(`/api/events/${empty}/overview`)).body;
    expect(overview.mila.hints).toContainEqual({
      key: 'budget.setup',
      card: 'budget',
      fingerprint: 'empty',
      highlighted: true,
    });
  });
});
