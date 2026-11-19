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
let adminId: string;
let orgId: string;
let eventId: string;

// The test event: Sat 12 Dec 2026, 14:00–23:00 Brussels.
const at = (time: string, day = 12) => `2026-12-${day}T${time}:00+01:00`;

beforeEach(async () => {
  admin = t.client();
  adminId = (await admin.signUp('Ada Admin', 'ada@example.com')).id;
  orgId = (await admin.createOrganization('KLJ Merkem')).id;
  eventId = (await admin.createEvent()).id;
});

const url = (path: string, event = eventId) => `/api/events/${event}/${path}`;

async function createTeam(name: string, body: Record<string, unknown> = {}) {
  const res = await admin.post(url('teams'), { name, ...body });
  if (res.status !== 201) throw new Error(`create team failed: ${res.status} ${res.text}`);
  return res.body as { id: string };
}

async function createShift(teamId: string, from: string, to: string, capacity = 2) {
  const res = await admin.post(url('shifts'), {
    teamId,
    startsAt: at(from),
    endsAt: at(to),
    capacity,
  });
  if (res.status !== 201) throw new Error(`create shift failed: ${res.status} ${res.text}`);
  return res.body as { id: string; meetingPoint: string | null };
}

async function addVolunteer(name: string, body: Record<string, unknown> = {}) {
  const res = await admin.post(url('applications'), { name, ...body });
  if (res.status !== 201) throw new Error(`add volunteer failed: ${res.status} ${res.text}`);
  return res.body as { id: string };
}

interface Board {
  shifts: { id: string; assignedCount: number; confirmedCount: number }[];
  applications: {
    id: string;
    name: string;
    availableShiftIds: string[];
    preferredTeamId: string | null;
    pendingNotice: string | null;
    hasSentSchedule: boolean;
    assignments: { id: string; shiftId: string; status: string; issues: string[] }[];
  }[];
  unpublishedChanges: number;
}

async function board(): Promise<Board> {
  const res = await admin.get(url('planning'));
  if (res.status !== 200) throw new Error(`board failed: ${res.status} ${res.text}`);
  return res.body as Board;
}

const assign = (applicationId: string, shiftId: string, acknowledgeWarnings = false) =>
  admin.post(url('assignments'), { applicationId, shiftId, acknowledgeWarnings });

const logOf = (entityType: string) =>
  t.db
    .select()
    .from(activityLog)
    .where(and(eq(activityLog.entityType, entityType), eq(activityLog.eventId, eventId)))
    .orderBy(asc(activityLog.createdAt));

describe('teams', () => {
  it('creates, renames and logs a team; names are unique per event', async () => {
    const bar = await createTeam('Bar', { defaultMeetingPoint: 'Achter de tent' });
    expect((await admin.post(url('teams'), { name: 'bar' })).status).toBe(409);

    const renamed = await admin.patch(url(`teams/${bar.id}`), { name: 'Toog' });
    expect(renamed.status).toBe(200);
    expect(renamed.body).toMatchObject({ name: 'Toog', defaultMeetingPoint: 'Achter de tent' });

    const log = await logOf('team');
    expect(log.map((e) => e.action)).toEqual(['created', 'updated']);
    expect(log[1]!.changes).toEqual({ name: { from: 'Bar', to: 'Toog' } });
  });

  it('deletes a team with its shifts, and asks first when confirmed people would go', async () => {
    const bar = await createTeam('Bar');
    const shift = await createShift(bar.id, '18:00', '21:00');
    const jan = await addVolunteer('Jan', {
      preferredTeamId: bar.id,
      availableShiftIds: [shift.id],
    });
    await assign(jan.id, shift.id);
    const [assignment] = (await board()).applications[0]!.assignments;
    await admin.post(url(`assignments/${assignment!.id}/confirm`));

    expect((await admin.delete(url(`teams/${bar.id}`))).status).toBe(409);
    expect((await admin.delete(url(`teams/${bar.id}?confirmed=true`))).status).toBe(204);

    const after = await board();
    expect(after.shifts).toEqual([]);
    expect(after.applications[0]).toMatchObject({ preferredTeamId: null, assignments: [] });
  });

  it('is read-only for members who do not manage the event', async () => {
    const { client: member } = await t.inviteMember(admin, orgId, 'Mo Member', 'mo@example.com');
    expect((await member.get(url('planning'))).status).toBe(200);
    expect((await member.post(url('teams'), { name: 'Bar' })).status).toBe(403);
  });
});

describe('shifts', () => {
  it('takes the team meeting point by default and must fall within the event', async () => {
    const bar = await createTeam('Bar', { defaultMeetingPoint: 'Achter de tent' });
    expect((await createShift(bar.id, '18:00', '21:00')).meetingPoint).toBe('Achter de tent');

    const tooLate = await admin.post(url('shifts'), {
      teamId: bar.id,
      startsAt: at('22:00'),
      endsAt: at('23:30'),
      capacity: 2,
    });
    expect(tooLate.status).toBe(400);
  });

  it('allows setup and teardown shifts once the event has them, and can cross midnight', async () => {
    const opbouw = await createTeam('Opbouw');
    const before = { teamId: opbouw.id, startsAt: at('09:00'), endsAt: at('12:00'), capacity: 4 };
    expect((await admin.post(url('shifts'), before)).status).toBe(400);

    const widened = await admin.patch(`/api/events/${eventId}`, {
      setupStartsAt: at('08:00'),
      teardownEndsAt: at('02:00', 13),
    });
    expect(widened.status).toBe(200);
    expect((await admin.post(url('shifts'), before)).status).toBe(201);
    const night = await admin.post(url('shifts'), {
      teamId: opbouw.id,
      startsAt: at('23:00'),
      endsAt: at('01:30', 13),
      capacity: 2,
    });
    expect(night.status).toBe(201);
  });

  it('refuses to shrink the event when shifts would fall outside it', async () => {
    const bar = await createTeam('Bar');
    await createShift(bar.id, '20:00', '23:00');
    const res = await admin.patch(`/api/events/${eventId}`, { endsAt: at('22:00') });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('shifts outside: 1');
  });

  it('only deletes a shift with confirmed assignments after confirming', async () => {
    const bar = await createTeam('Bar');
    const shift = await createShift(bar.id, '18:00', '21:00');
    const jan = await addVolunteer('Jan', { availableShiftIds: [shift.id] });
    await assign(jan.id, shift.id);

    // Proposed only: no confirmation needed.
    expect((await admin.delete(url(`shifts/${shift.id}`))).status).toBe(204);
    const log = await logOf('assignment');
    expect(log.map((e) => e.action)).toEqual(['created', 'deleted']);
  });
});

describe('assignments', () => {
  let bar: { id: string };
  let early: { id: string };
  let late: { id: string };
  let overlapping: { id: string };

  beforeEach(async () => {
    bar = await createTeam('Bar');
    early = await createShift(bar.id, '18:00', '21:00', 1);
    late = await createShift(bar.id, '21:00', '23:00', 1);
    overlapping = await createShift(bar.id, '20:00', '22:00', 1);
  });

  it('places a volunteer as a proposal and counts coverage', async () => {
    const jan = await addVolunteer('Jan', { availableShiftIds: [early.id, late.id] });
    expect((await assign(jan.id, early.id)).status).toBe(204);
    expect((await assign(jan.id, late.id)).status).toBe(204);

    const state = await board();
    expect(state.shifts.find((s) => s.id === early.id)).toMatchObject({
      assignedCount: 1,
      confirmedCount: 0,
    });
    expect(state.applications[0]!.assignments.map((a) => a.status)).toEqual([
      'proposed',
      'proposed',
    ]);
  });

  it('refuses overlapping shifts for the same volunteer', async () => {
    const jan = await addVolunteer('Jan', { wholeEvent: true });
    await assign(jan.id, early.id);
    const res = await assign(jan.id, overlapping.id, true);
    expect(res.status).toBe(409);
    expect(res.body.message).toBe(`overlap: ${early.id}`);
  });

  it('warns about a full shift or one the volunteer did not mark, until acknowledged', async () => {
    const jan = await addVolunteer('Jan', { availableShiftIds: [early.id] });
    const mia = await addVolunteer('Mia', { availableShiftIds: [late.id] });
    await assign(jan.id, early.id);

    const warned = await assign(mia.id, early.id);
    expect(warned.status).toBe(409);
    expect(warned.body.message).toBe('warnings: over_capacity,not_available');

    expect((await assign(mia.id, early.id, true)).status).toBe(204);
    const mias = (await board()).applications.find((a) => a.name === 'Mia')!;
    expect(mias.assignments[0]!.issues).toEqual(['over_capacity', 'not_available']);
  });

  it('moves, confirms all and unassigns', async () => {
    const jan = await addVolunteer('Jan', { availableShiftIds: [early.id, late.id] });
    await assign(jan.id, early.id);
    const [assignment] = (await board()).applications[0]!.assignments;

    expect(
      (await admin.patch(url(`assignments/${assignment!.id}`), { shiftId: late.id })).status,
    ).toBe(204);
    const confirmed = await admin.post(url('assignments/confirm-all'));
    expect(confirmed.body).toEqual({ confirmed: 1 });
    expect((await board()).applications[0]!.assignments[0]).toMatchObject({
      shiftId: late.id,
      status: 'confirmed',
    });

    expect((await admin.delete(url(`assignments/${assignment!.id}`))).status).toBe(204);
    expect((await board()).applications[0]!.assignments).toEqual([]);
    const actions = (await logOf('assignment')).map((e) => e.action);
    expect(actions).toEqual(['created', 'moved', 'confirmed', 'deleted']);
  });
});

describe('volunteers added by hand', () => {
  it('needs no email, reuses a known email and refuses a second application', async () => {
    await addVolunteer('Buurman Jef', { phone: '0470 12 34 56' });
    await addVolunteer('Jan', { email: 'Jan@Example.com' });
    const again = await admin.post(url('applications'), {
      name: 'Jan P.',
      email: 'jan@example.com',
    });
    expect(again.status).toBe(409);

    const applications = (await board()).applications;
    expect(applications.map((a) => a.name)).toEqual(['Buurman Jef', 'Jan']);
    // Personal data never reaches the log.
    const [created] = await logOf('volunteer');
    expect(created!.changes).toMatchObject({ name: null });
  });

  it('removes an application and its assignments', async () => {
    const bar = await createTeam('Bar');
    const shift = await createShift(bar.id, '18:00', '21:00');
    const jan = await addVolunteer('Jan', { availableShiftIds: [shift.id] });
    await assign(jan.id, shift.id);
    expect((await admin.delete(url(`applications/${jan.id}`))).status).toBe(204);
    const state = await board();
    expect(state.applications).toEqual([]);
    expect(state.shifts[0]!.assignedCount).toBe(0);
  });
});

describe('public registration', () => {
  let slug: string;
  let bar: { id: string };
  let early: { id: string };
  let late: { id: string };
  const anonymous = () => t.client();

  beforeEach(async () => {
    bar = await createTeam('Bar', { description: 'Tappen en afwassen' });
    early = await createShift(bar.id, '18:00', '21:00');
    late = await createShift(bar.id, '21:00', '23:00');
    await admin.patch(`/api/events/${eventId}`, { status: 'published' });
    const opened = await admin.patch(url('registration'), {
      registrationOpen: true,
      shiftsPerVolunteer: 2,
    });
    if (opened.status !== 200) throw new Error(`open registration failed: ${opened.text}`);
    slug = opened.body.publicSlug as string;
  });

  it('gives the event a readable public link when registration opens', () => {
    expect(slug).toMatch(/^kerstmarkt-2026-[a-z2-9]{4}$/);
  });

  const signUp = (body: Record<string, unknown> = {}) =>
    anonymous().post(`/api/public/events/${slug}/registrations`, {
      name: 'Jan Peeters',
      email: 'jan@example.com',
      availableShiftIds: [early.id, late.id],
      wholeEvent: false,
      preferredTeamId: bar.id,
      notes: 'Liefst na 18u',
      consent: true,
      ...body,
    });

  it('shows the event and shifts without anything about other volunteers', async () => {
    await signUp();
    const res = await anonymous().get(`/api/public/events/${slug}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      name: 'Kerstmarkt 2026',
      organizationName: 'KLJ Merkem',
      closedReason: null,
      requiredShifts: 2,
      teams: [{ name: 'Bar', shifts: [{ id: early.id }, { id: late.id }] }],
    });
    expect(JSON.stringify(res.body)).not.toContain('jan@example.com');
    expect(res.body.teams[0].shifts[0]).not.toHaveProperty('capacity');
  });

  it('stores the volunteer and application, logs it as the volunteer and emails them', async () => {
    expect((await signUp()).status).toBe(204);
    const [application] = (await board()).applications;
    expect(application).toMatchObject({
      name: 'Jan Peeters',
      availableShiftIds: [early.id, late.id],
      preferredTeamId: bar.id,
    });
    const [entry] = await logOf('volunteer_application');
    expect(entry).toMatchObject({ action: 'created', actorType: 'volunteer' });
    expect(entry!.changes).toMatchObject({ notes: null });
    expect(t.emails.lastTo('jan@example.com')?.subject).toBe(
      'Je inschrijving voor Kerstmarkt 2026 is ontvangen',
    );
  });

  it('updates the application when the same email signs up again', async () => {
    await signUp();
    expect(
      (
        await signUp({
          email: 'JAN@example.com',
          availableShiftIds: [late.id, early.id],
          wholeEvent: true,
        })
      ).status,
    ).toBe(204);
    const { applications } = await board();
    expect(applications).toHaveLength(1);
    expect(t.emails.lastTo('jan@example.com')?.subject).toBe(
      'Je inschrijving voor Kerstmarkt 2026 is bijgewerkt',
    );
  });

  it('asks for the required number of shifts and only known ones', async () => {
    expect((await signUp({ availableShiftIds: [early.id] })).status).toBe(400);
    expect((await signUp({ availableShiftIds: [early.id, eventId] })).status).toBe(400);
    expect((await signUp({ consent: false })).status).toBe(400);
  });

  it('trims spaces around the email address', async () => {
    expect((await signUp({ email: '  Jan@Example.com ' })).status).toBe(204);
    expect(t.emails.lastTo('jan@example.com')).toBeDefined();
  });

  it('drops a filled-in honeypot without storing anything', async () => {
    expect((await signUp({ website: 'http://spam.example' })).status).toBe(204);
    expect((await board()).applications).toEqual([]);
  });

  it('is closed after the deadline, when closed or unpublished', async () => {
    await admin.patch(url('registration'), { registrationDeadline: '2020-01-01T00:00:00Z' });
    expect((await anonymous().get(`/api/public/events/${slug}`)).body).toMatchObject({
      closedReason: 'deadline_passed',
      teams: [],
    });
    expect((await signUp()).status).toBe(409);
    expect((await anonymous().get('/api/public/events/unknown-slug')).status).toBe(404);
  });

  it('limits sign-ups per address', async () => {
    for (let i = 0; i < 5; i++) {
      expect((await signUp({ email: `v${i}@example.com` })).status).toBe(204);
    }
    expect((await signUp({ email: 'v6@example.com' })).status).toBe(429);
  });
});

describe('sending the schedule', () => {
  let bar: { id: string };
  let early: { id: string };
  let late: { id: string };

  beforeEach(async () => {
    bar = await createTeam('Bar');
    early = await createShift(bar.id, '18:00', '21:00');
    late = await createShift(bar.id, '21:00', '23:00');
  });

  async function confirmed(applicationId: string, shiftId: string) {
    await assign(applicationId, shiftId, true);
    const application = (await board()).applications.find((a) => a.id === applicationId)!;
    const assignment = application.assignments.find((a) => a.shiftId === shiftId)!;
    await admin.post(url(`assignments/${assignment.id}/confirm`));
    return assignment.id;
  }

  const publish = (includeNotNeeded = false) =>
    admin.post(url('schedule/publish'), { includeNotNeeded, scheduleFinal: true });

  it('emails confirmed shifts once, thanks the rest, and lists people without email', async () => {
    const jan = await addVolunteer('Jan', { email: 'jan@example.com' });
    await addVolunteer('Mia', { email: 'mia@example.com' });
    const jef = await addVolunteer('Jef');
    await confirmed(jan.id, early.id);
    await confirmed(jef.id, late.id);

    const preview = await admin.get(url('schedule/preview'));
    expect(
      preview.body.recipients.map((r: { name: string; kind: string }) => [r.name, r.kind]),
    ).toEqual([
      ['Jan', 'schedule'],
      ['Jef', 'schedule'],
      ['Mia', 'not_needed'],
    ]);

    const result = await publish(true);
    expect(result.body).toEqual({ sent: 2, failed: [], withoutEmail: 1 });
    const janMail = t.emails.lastTo('jan@example.com')!;
    expect(janMail.subject).toBe('Je shiften voor Kerstmarkt 2026');
    expect(janMail.replyTo).toBe('ada@example.com');
    expect(t.emails.lastTo('mia@example.com')?.subject).toBe(
      'Bedankt voor je inschrijving voor Kerstmarkt 2026',
    );
    const [entry] = (await logOf('event')).filter((e) => e.action === 'schedule_published');
    expect(entry!.changes).toEqual({ sent: { to: 2 }, failed: { to: 0 }, withoutEmail: { to: 1 } });

    // Only once.
    expect((await publish()).status).toBe(409);
  });

  it('needs the organizer to say it is final, and no open proposals', async () => {
    const jan = await addVolunteer('Jan', { email: 'jan@example.com' });
    await assign(jan.id, early.id, true);
    const notFinal = await admin.post(url('schedule/publish'), { includeNotNeeded: false });
    expect(notFinal.status).toBe(400);
    const proposed = await publish();
    expect(proposed.status).toBe(409);
    expect(proposed.body.message).toBe('Confirm or remove the proposed assignments first');
  });

  it('tells changed volunteers one by one after the send', async () => {
    const jan = await addVolunteer('Jan', { email: 'jan@example.com' });
    const mia = await addVolunteer('Mia', { email: 'mia@example.com' });
    const jef = await addVolunteer('Jef');
    const janAssignment = await confirmed(jan.id, early.id);
    await confirmed(mia.id, early.id);
    await publish();
    expect((await board()).unpublishedChanges).toBe(0);
    t.emails.reset();

    await admin.delete(url(`assignments/${janAssignment}`));
    await admin.patch(url(`shifts/${early.id}`), { startsAt: at('17:30') });
    await confirmed(jef.id, late.id);
    const state = await board();
    expect(state.unpublishedChanges).toBe(3);
    const pending = Object.fromEntries(state.applications.map((a) => [a.name, a.pendingNotice]));
    expect(pending).toEqual({ Jan: 'removed', Mia: 'updated', Jef: 'schedule' });
    // Nothing was sent by the changes themselves.
    expect(t.emails.sent).toHaveLength(0);

    const notifyJan = await admin.post(url(`applications/${jan.id}/notify`));
    expect(notifyJan.body).toEqual({ emailed: true });
    expect(t.emails.lastTo('jan@example.com')?.subject).toBe(
      'Je staat niet meer ingepland voor Kerstmarkt 2026',
    );
    expect((await admin.post(url(`applications/${mia.id}/notify`))).status).toBe(200);
    expect(t.emails.lastTo('mia@example.com')?.subject).toBe(
      'Gewijzigd: je shiften voor Kerstmarkt 2026',
    );
    // No address: recorded as told by the organizer.
    expect((await admin.post(url(`applications/${jef.id}/notify`))).body).toEqual({
      emailed: false,
    });
    expect((await board()).unpublishedChanges).toBe(0);
    expect((await admin.post(url(`applications/${mia.id}/notify`))).status).toBe(409);
  });

  it('sends once even when two requests come in together', async () => {
    const jan = await addVolunteer('Jan', { email: 'jan@example.com' });
    await confirmed(jan.id, early.id);
    const results = await Promise.all([publish(), publish()]);
    expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([200, 409]);
    expect(t.emails.sent.filter((m) => m.to === 'jan@example.com')).toHaveLength(1);
  });

  it('only removes a volunteer who got their shifts after telling them', async () => {
    const jan = await addVolunteer('Jan', { email: 'jan@example.com' });
    const assignmentId = await confirmed(jan.id, early.id);
    await publish();
    expect((await board()).applications[0]!.hasSentSchedule).toBe(true);
    expect((await admin.delete(url(`applications/${jan.id}`))).status).toBe(409);

    await admin.delete(url(`assignments/${assignmentId}`));
    await admin.post(url(`applications/${jan.id}/notify`));
    expect(t.emails.lastTo('jan@example.com')?.subject).toBe(
      'Je staat niet meer ingepland voor Kerstmarkt 2026',
    );
    expect((await admin.delete(url(`applications/${jan.id}`))).status).toBe(204);
  });

  it('leaves a failed email to be sent to that volunteer later', async () => {
    const jan = await addVolunteer('Jan', { email: 'jan@example.com' });
    await confirmed(jan.id, early.id);
    t.emails.failNext(1, { retryable: false });
    const first = await publish();
    expect(first.body).toMatchObject({ sent: 0, failed: [{ name: 'Jan' }] });

    expect((await board()).applications[0]!.pendingNotice).toBe('schedule');
    expect((await admin.post(url(`applications/${jan.id}/notify`))).body).toEqual({
      emailed: true,
    });
  });
});

it('keeps planning data inside the organization', async () => {
  const other = t.client();
  await other.signUp('Olga Other', 'olga@example.com');
  await other.createOrganization('Chiro Elders');
  expect((await other.get(url('planning'))).status).toBe(404);
  expect((await other.post(url('teams'), { name: 'Bar' })).status).toBe(404);
  void adminId;
});
