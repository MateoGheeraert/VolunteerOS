import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp, type TestClient } from './test-app.js';

let t: TestApp;

// Mila counts as available, so her hints show; no model is ever called.
beforeAll(async () => {
  t = await createTestApp({ aiAvailable: true });
});
afterAll(() => t.close());
beforeEach(() => t.reset());

const DAY_MS = 24 * 60 * 60 * 1000;
/** The event is always just under 40 days ahead (40 rounded up), so the test doesn't age. */
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
  eventId = (await admin.createEvent({ startsAt: at(0), endsAt: at(9) })).id;
});

const url = (path: string) => `/api/events/${eventId}/${path}`;

async function overview(client = admin) {
  const res = await client.get(url('overview'));
  if (res.status !== 200) throw new Error(`overview failed: ${res.status} ${res.text}`);
  return res.body;
}

async function post(path: string, body: Record<string, unknown>) {
  const res = await admin.post(url(path), body);
  if (res.status !== 201) throw new Error(`${path} failed: ${res.status} ${res.text}`);
  return res.body as { id: string };
}

describe('event overview', () => {
  it('shows a new event as empty, with Mila offering to set up the tasks', async () => {
    const body = await overview();
    expect(body).toMatchObject({
      phase: 'before',
      daysToStart: 40,
      tasks: { status: 'neutral', total: 0, next: [] },
      // Nothing planned 40 days ahead: not at risk yet, but worth attention.
      planning: { status: 'warn', positions: 0, applications: 0, teams: [] },
      budget: { status: 'neutral', entryCount: 0 },
      mila: {
        enabled: true,
        statusSuggestion: 'publish',
        // In the empty card she is the empty state, also next to the status banner.
        hints: [{ key: 'tasks.setup', card: 'tasks', fingerprint: 'empty', highlighted: true }],
      },
    });
  });

  it('counts tasks, planning and budget', async () => {
    await post('tasks', { title: 'Tent huren', dueDate: day(-2), assigneeUserId: adminId });
    await post('tasks', { title: 'Affiche', priority: 'high' });
    const done = await post('tasks', { title: 'Datum kiezen' });
    expect((await admin.patch(url(`tasks/${done.id}`), { status: 'done' })).status).toBe(200);

    const bar = await post('teams', { name: 'Bar' });
    const shift = await post('shifts', {
      teamId: bar.id,
      startsAt: at(0),
      endsAt: at(4),
      capacity: 2,
    });
    const mia = await post('applications', { name: 'Mia', availableShiftIds: [shift.id] });
    await post('applications', { name: 'Noah' });
    const assigned = await admin.post(url('assignments'), {
      applicationId: mia.id,
      shiftId: shift.id,
    });
    expect(assigned.status).toBe(204);

    await post('budget-entries', {
      type: 'expense',
      title: 'Tent',
      estimatedCents: 60000,
      actualCents: 42000,
    });
    await post('budget-entries', { type: 'income', title: 'Bar', estimatedCents: 80000 });

    const body = await overview();
    expect(body.tasks).toMatchObject({
      status: 'bad',
      total: 3,
      done: 1,
      todo: 2,
      unassigned: 1,
      overdue: 1,
    });
    expect(body.tasks.next.map((task: { title: string }) => task.title)).toEqual([
      'Tent huren',
      'Affiche',
    ]);
    expect(body.tasks.next[0]).toMatchObject({ overdue: true, assigneeName: 'Ada Admin' });
    expect(body.planning).toMatchObject({
      status: 'warn',
      shiftCount: 1,
      positions: 2,
      filled: 1,
      confirmed: 0,
      applications: 2,
      assignedVolunteers: 1,
      unassignedVolunteers: 1,
      teams: [{ id: bar.id, name: 'Bar', positions: 2, filled: 1, confirmed: 0 }],
    });
    expect(body.budget).toMatchObject({
      status: 'ok',
      entryCount: 2,
      expense: { estimated: 60000, actual: 42000 },
      income: { estimated: 80000, actual: 0 },
      result: { estimated: 20000, actual: -42000 },
    });
    // Tasks exist and Mila never looked for missing ones.
    expect(body.mila.hints.map((hint: { key: string }) => hint.key)).toEqual([
      'tasks.find_missing',
    ]);
  });

  it('judges whole-event planning by the volunteers placed, not by places', async () => {
    const res = await admin.patch(url('registration'), { volunteerCommitment: 'whole_event' });
    expect(res.status).toBe(200);
    const bar = await post('teams', { name: 'Bar' });
    const shift = await post('shifts', {
      teamId: bar.id,
      startsAt: at(0),
      endsAt: at(4),
      capacity: 1,
    });
    const mia = await post('applications', { name: 'Mia', wholeEvent: true });
    await post('applications', { name: 'Noah', wholeEvent: true });
    expect(
      (await admin.post(url('assignments'), { applicationId: mia.id, shiftId: shift.id })).status,
    ).toBe(204);

    // The one place is full, but half of the volunteers still wait for a shift.
    expect((await overview()).planning).toMatchObject({
      volunteerCommitment: 'whole_event',
      status: 'warn',
      applications: 2,
      assignedVolunteers: 1,
    });
  });

  it('keeps a dismissed hint away for that user', async () => {
    const dismiss = await admin.post(url('overview/hint-dismissals'), {
      hintKey: 'tasks.setup',
      fingerprint: 'empty',
    });
    expect(dismiss.status).toBe(204);
    expect((await overview()).mila.hints).toEqual([]);

    // A new situation (tasks now exist) brings Mila back with another hint.
    await post('tasks', { title: 'Tent huren' });
    expect((await overview()).mila.hints.map((hint: { key: string }) => hint.key)).toEqual([
      'tasks.find_missing',
    ]);
  });

  it('shows members the cards without Mila, and only the tasks they may see', async () => {
    await post('tasks', { title: 'Tent huren', assigneeUserId: adminId });
    await post('tasks', { title: 'Affiche' });
    const { client: member } = await t.inviteMember(admin, orgId, 'Mo Member', 'mo@example.com');

    const body = await overview(member);
    expect(body.tasks.total).toBe(2);
    expect(body.tasks.next.map((task: { title: string }) => task.title)).toEqual(['Affiche']);
    expect(body.mila).toMatchObject({ enabled: false, statusSuggestion: null, hints: [] });

    const dismiss = await member.post(url('overview/hint-dismissals'), {
      hintKey: 'tasks.setup',
      fingerprint: 'empty',
    });
    expect(dismiss.status).toBe(403);
  });
});
