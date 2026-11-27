import { and, asc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AiRunWorker } from '../src/ai/runs/ai-run-worker.service.js';
import { activityLog, aiRun, type AiFeature } from '../src/db/schema/index.js';
import { createTestApp, type ModelCall, type TestApp, type TestClient } from './test-app.js';

/**
 * Mila on the planning page (docs/info.md §7.7.1), end to end with a scripted model: teams and
 * shifts, planning rules (by hand, from the organizer's text, from notes) and the allocation.
 */

let t: TestApp;
/** What the scripted model answers, per prompt. */
const answers: { shifts?: unknown; ruleText?: unknown; notes?: unknown } = {};
const calls: ModelCall[] = [];

beforeAll(async () => {
  t = await createTestApp({
    respond: (call) => {
      calls.push(call);
      if (call.system.includes('Propose the teams and shifts')) return answers.shifts;
      if (call.system.includes('An organizer tells you')) return answers.ruleText;
      if (call.system.includes('Read the notes')) return answers.notes;
      throw new Error('unexpected prompt');
    },
  });
});
afterAll(() => t.close());

let admin: TestClient;
let orgId: string;
let eventId: string;

// The test event: Sat 12 Dec 2026, 14:00–23:00 Brussels, setup from Friday 18:00.
const at = (time: string, day = 12) => `2026-12-${day}T${time}:00+01:00`;

beforeEach(async () => {
  await t.reset();
  calls.length = 0;
  delete answers.shifts;
  delete answers.ruleText;
  delete answers.notes;
  admin = t.client();
  await admin.signUp('Ada Admin', 'ada@example.com');
  orgId = (await admin.createOrganization('KLJ Merkem')).id;
  eventId = (await admin.createEvent({ setupStartsAt: at('18:00', 11), expectedAttendance: 800 }))
    .id;
});

const url = (path: string, event = eventId) => `/api/events/${event}/${path}`;

async function ok<T>(
  promise: PromiseLike<{ status: number; text: string; body: unknown }>,
  status: number,
) {
  const res = await promise;
  if (res.status !== status) throw new Error(`expected ${status}, got ${res.status}: ${res.text}`);
  return res.body as T;
}

const createTeam = (name: string) => ok<{ id: string }>(admin.post(url('teams'), { name }), 201);
const createShift = (teamId: string, from: string, to: string, capacity = 2) =>
  ok<{ id: string }>(
    admin.post(url('shifts'), { teamId, startsAt: at(from), endsAt: at(to), capacity }),
    201,
  );
const addVolunteer = (name: string, body: Record<string, unknown> = {}) =>
  ok<{ id: string }>(admin.post(url('applications'), { name, ...body }), 201);

interface Board {
  teams: { id: string; name: string }[];
  shifts: {
    id: string;
    teamId: string;
    capacity: number;
    startsAt: string;
    assignedCount: number;
  }[];
  applications: {
    id: string;
    volunteerId: string;
    name: string;
    assignments: { shiftId: string; status: string; assignedByUserId: string | null }[];
  }[];
}
const board = () => ok<Board>(admin.get(url('planning')), 200);
const volunteerId = async (name: string) =>
  (await board()).applications.find((a) => a.name === name)!.volunteerId;

interface Suggestion {
  id: string;
  kind: string;
  status: string;
  title: string;
  explanation: string;
  payload: {
    shifts: { startsAt: string; endsAt: string; capacity: number }[];
    placements: { applicationId: string; shiftId: string }[];
    [field: string]: unknown;
  };
  citations: { type: string; label: string }[];
}
const suggestions = async (kind?: string) =>
  (await ok<{ suggestions: Suggestion[] }>(admin.get(url('ai')), 200)).suggestions.filter(
    (s) => !kind || s.kind === kind,
  );

/** Processes a run as the queue would. */
async function runMila(feature: AiFeature) {
  const [run] = await t.db
    .insert(aiRun)
    .values({ organizationId: orgId, eventId, feature, trigger: 'on_demand' })
    .returning();
  await t.app.get(AiRunWorker).handle({ runId: run!.id });
  const [done] = await t.db.select().from(aiRun).where(eq(aiRun.id, run!.id));
  expect(done!.error).toBeNull();
  expect(done!.status).toBe('succeeded');
  return done!;
}

const logOf = (entityType: string) =>
  t.db
    .select()
    .from(activityLog)
    .where(and(eq(activityLog.entityType, entityType), eq(activityLog.eventId, eventId)))
    .orderBy(asc(activityLog.createdAt));

const noRule = { other: null, otherRefs: [], team: null, maxShifts: null, time: null };

describe('planning rules', () => {
  it('creates, lists, edits and deletes rules; refuses doubles and people not on the event', async () => {
    await addVolunteer('Emma Claes');
    await addVolunteer('Noah Wouters');
    const emma = await volunteerId('Emma Claes');
    const noah = await volunteerId('Noah Wouters');

    await ok(
      admin.post(url('planning-rules'), {
        kind: 'not_team',
        scope: 'organization',
        volunteerId: emma,
        teamName: 'Kassa',
      }),
      204,
    );
    await ok(
      admin.post(url('planning-rules'), {
        kind: 'never_together',
        scope: 'event',
        volunteerId: emma,
        otherVolunteerId: noah,
      }),
      204,
    );
    // The same pair the other way round is the same rule.
    expect(
      (
        await admin.post(url('planning-rules'), {
          kind: 'never_together',
          scope: 'event',
          volunteerId: noah,
          otherVolunteerId: emma,
        })
      ).status,
    ).toBe(409);
    // Fields the kind doesn't use, or misses, are refused.
    expect(
      (
        await admin.post(url('planning-rules'), {
          kind: 'not_team',
          scope: 'event',
          volunteerId: emma,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await admin.post(url('planning-rules'), {
          kind: 'not_before',
          scope: 'event',
          volunteerId: emma,
          time: '18:00',
          teamName: 'Bar',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await admin.post(url('planning-rules'), {
          kind: 'max_shifts',
          scope: 'event',
          volunteerId: '00000000-0000-4000-8000-000000000000',
          maxShifts: 1,
        })
      ).status,
    ).toBe(400);

    const rules = await ok<
      {
        id: string;
        kind: string;
        scope: string;
        volunteer: { name: string };
        otherVolunteer: { name: string } | null;
        source: string;
      }[]
    >(admin.get(url('planning-rules')), 200);
    expect(rules).toMatchObject([
      {
        kind: 'not_team',
        scope: 'organization',
        volunteer: { name: 'Emma Claes' },
        source: 'organizer',
      },
      { kind: 'never_together', scope: 'event', otherVolunteer: { name: 'Noah Wouters' } },
    ]);

    await ok(
      admin.patch(url(`planning-rules/${rules[0]!.id}`), {
        kind: 'only_team',
        scope: 'organization',
        volunteerId: emma,
        teamName: 'Bar',
      }),
      204,
    );
    await ok(admin.delete(url(`planning-rules/${rules[1]!.id}`)), 204);
    const after = await ok<{ kind: string; teamName: string }[]>(
      admin.get(url('planning-rules')),
      200,
    );
    expect(after).toMatchObject([{ kind: 'only_team', teamName: 'Bar' }]);
    expect((await logOf('planning_rule')).map((row) => row.action)).toEqual([
      'created',
      'created',
      'updated',
      'deleted',
    ]);
  });

  it('copies event rules to the next edition; organization rules hold there anyway', async () => {
    await addVolunteer('Emma Claes', { email: 'emma@example.com' });
    const emma = await volunteerId('Emma Claes');
    await ok(
      admin.post(url('planning-rules'), {
        kind: 'not_before',
        scope: 'event',
        volunteerId: emma,
        time: '18:00',
      }),
      204,
    );
    await ok(
      admin.post(url('planning-rules'), {
        kind: 'not_team',
        scope: 'organization',
        volunteerId: emma,
        teamName: 'Kassa',
      }),
      204,
    );

    const next = await admin.createEvent({
      name: 'Kerstmarkt 2027',
      startsAt: '2027-12-11T14:00:00+01:00',
      endsAt: '2027-12-11T23:00:00+01:00',
      previousEditionId: eventId,
    });
    // Emma signs up again: the same volunteer, so both rules apply to her there.
    await ok(
      admin.post(url('applications', next.id), { name: 'Emma Claes', email: 'emma@example.com' }),
      201,
    );
    const rules = await ok<{ kind: string; scope: string; copiedFromPreviousEdition: boolean }[]>(
      admin.get(url('planning-rules', next.id)),
      200,
    );
    expect(
      rules
        .map((r) => [r.kind, r.scope, r.copiedFromPreviousEdition])
        .toSorted((a, b) => String(a[0]).localeCompare(String(b[0]))),
    ).toEqual([
      ['not_before', 'event', true],
      ['not_team', 'organization', false],
    ]);
  });
});

describe('"Vertel Mila iets over de planning"', () => {
  it('turns text into chips, asks which Jan, reports unknown names, then saves what is kept', async () => {
    await createTeam('Bar');
    await addVolunteer('Jan Peeters');
    await addVolunteer('Jan De Wit');
    await addVolunteer('Zoë Claes');
    answers.ruleText = {
      rules: [
        {
          ...noRule,
          kind: 'not_team',
          person: 'Jan',
          personRefs: ['V1'],
          team: 'T1',
          scope: 'organization',
          quote: 'Jan niet aan de bar',
        },
        {
          ...noRule,
          kind: 'max_shifts',
          person: 'Karel',
          personRefs: [],
          maxShifts: 1,
          scope: 'organization',
          quote: 'Karel maar 1 shift',
        },
        {
          ...noRule,
          kind: 'not_after',
          person: 'Zoë',
          personRefs: ['V3'],
          time: '22u',
          scope: 'event',
          quote: 'Zoë moet om 22u weg',
        },
      ],
    };
    const draft = await ok<{
      runId: string;
      rules: {
        kind: string;
        person: { volunteerId: string | null; candidates: { volunteerId: string; name: string }[] };
        teamName: string | null;
        time: string | null;
        scope: string;
      }[];
      unknownNames: string[];
    }>(
      admin.post(url('ai/planning/rule-drafts'), {
        text: 'Jan niet aan de bar. Karel maar 1 shift. Zoë moet om 22u weg.',
      }),
      200,
    );
    expect(calls[0]!.prompt).toContain('[V1] Jan Peeters');
    expect(draft.unknownNames).toEqual(['Karel']);
    expect(draft.rules).toHaveLength(2);
    const [jan, zoe] = draft.rules;
    expect(jan!.person.volunteerId).toBeNull();
    expect(jan!.person.candidates.map((c) => c.name)).toEqual(['Jan De Wit', 'Jan Peeters']);
    expect(zoe).toMatchObject({ kind: 'not_after', time: '22:00', scope: 'event' });

    // Nothing is saved until the organizer confirms.
    expect(await ok<unknown[]>(admin.get(url('planning-rules')), 200)).toEqual([]);
    const chosen = jan!.person.candidates.find((c) => c.name === 'Jan Peeters')!.volunteerId;
    await ok(
      admin.post(url(`ai/planning/rule-drafts/${draft.runId}/rules`), {
        rules: [
          { kind: 'not_team', scope: 'organization', volunteerId: chosen, teamName: 'Bar' },
          {
            kind: 'not_after',
            scope: 'event',
            volunteerId: zoe!.person.volunteerId,
            time: '22:00',
          },
        ],
      }),
      204,
    );
    const rules = await ok<{ volunteer: { name: string } }[]>(
      admin.get(url('planning-rules')),
      200,
    );
    expect(rules.map((r) => r.volunteer.name)).toEqual(['Jan Peeters', 'Zoë Claes']);
    expect(
      (await logOf('planning_rule')).every(
        (row) => row.sourceType === 'ai_run' && row.sourceId === draft.runId,
      ),
    ).toBe(true);
  });
});

describe('"Stel teams en shiften voor"', () => {
  it('suggests a new team with its shifts and a capacity change, each citing its source', async () => {
    const bar = await createTeam('Bar');
    const early = await createShift(bar.id, '14:00', '18:00', 2);
    answers.shifts = {
      newTeams: [
        {
          name: 'Kassa',
          description: 'Bonnetjes verkopen.',
          meetingPoint: null,
          shifts: [
            { day: '2026-12-12', start: '14:00', end: '18:00', capacity: 2 },
            { day: '2026-12-12', start: '18:00', end: '23:00', capacity: 2 },
            // Outside the event: dropped by the planner.
            { day: '2026-12-13', start: '14:00', end: '18:00', capacity: 2 },
          ],
          reason: 'Bij een markt is er altijd een kassa.',
          cites: ['C3'],
        },
        {
          name: 'bar',
          description: null,
          meetingPoint: null,
          shifts: [],
          reason: '',
          cites: ['E'],
        },
      ],
      changes: [
        {
          team: 'T1',
          type: 'capacity',
          shift: 'S1',
          day: null,
          start: null,
          end: null,
          capacity: 4,
          reason: '800 bezoekers.',
          cites: ['E'],
        },
      ],
    };
    await runMila('shift_suggestions');
    expect(calls[0]!.prompt).toContain('[C3] Kassa (during)');

    const [team] = await suggestions('team_suggestion');
    expect(team).toMatchObject({
      title: 'Kassa',
      citations: [{ type: 'catalogue', label: 'Kassa' }],
    });
    expect(team!.payload.shifts).toHaveLength(2);
    const [change] = await suggestions('shift_change');
    expect(change).toMatchObject({
      title: 'Bar 14:00–18:00: 2 → 4',
      payload: { fromCapacity: 2, capacity: 4 },
    });

    // Edited: another name, only the first shift, one more person.
    await ok(
      admin.post(url('ai/planning/suggestions/accept-teams'), {
        items: [
          {
            suggestionId: team!.id,
            team: {
              name: 'Kassa en tickets',
              description: 'Bonnetjes verkopen.',
              defaultMeetingPoint: 'Ingang',
            },
            shifts: [{ ...team!.payload.shifts[0], capacity: 3 }],
          },
        ],
      }),
      204,
    );
    await ok(
      admin.post(url(`ai/planning/suggestions/${change!.id}/accept-shift-change`), { capacity: 5 }),
      204,
    );

    const after = await board();
    const kassa = after.teams.find((x) => x.name === 'Kassa en tickets')!;
    expect(after.shifts.filter((s) => s.teamId === kassa.id).map((s) => s.capacity)).toEqual([3]);
    expect(after.shifts.find((s) => s.id === early.id)!.capacity).toBe(5);
    expect(await suggestions()).toEqual([]);
    const created = await logOf('team');
    expect(created.at(-1)).toMatchObject({ sourceType: 'ai_suggestion', sourceId: team!.id });
  });
});

describe('"Laat Mila verdelen"', () => {
  async function setUp() {
    const bar = await createTeam('Bar');
    const early = await createShift(bar.id, '14:00', '18:00', 2);
    const late = await createShift(bar.id, '18:00', '23:00', 2);
    const both = [early.id, late.id];
    await addVolunteer('Pieter Janssens', { availableShiftIds: both, notes: 'Ik kan pas na 18u.' });
    await addVolunteer('Emma Claes', { availableShiftIds: both });
    await addVolunteer('Noah Wouters', { availableShiftIds: [early.id] });
    const lies = await addVolunteer('Lies Maes', { availableShiftIds: both });
    await ok(admin.post(url('assignments'), { applicationId: lies.id, shiftId: early.id }), 204);
    answers.notes = {
      rules: [{ note: 'N1', kind: 'not_before', ...noRule, time: '18:00', quote: 'pas na 18u' }],
    };
    return { early, late, lies };
  }

  it('reads the notes, fills only open places with the rules respected, and never moves anyone', async () => {
    const { early, late, lies } = await setUp();
    await runMila('allocation');
    expect(calls[0]!.prompt).toContain('[N1] by Pieter Janssens');

    const [card] = await suggestions('planning_rule');
    expect(card).toMatchObject({
      title: 'Pieter Janssens: niet vóór 18:00',
      citations: [{ type: 'note' }],
    });
    const [proposal] = await suggestions('allocation');
    const names = new Map((await board()).applications.map((a) => [a.id, a.name]));
    const placed = proposal!.payload.placements.map(
      (p: { applicationId: string; shiftId: string }) =>
        `${names.get(p.applicationId)}→${p.shiftId === early.id ? 'early' : 'late'}`,
    );
    // Pieter only after 18:00; Noah could only do the early shift; Lies keeps her place.
    expect(placed.toSorted((a: string, b: string) => a.localeCompare(b))).toEqual([
      'Emma Claes→late',
      'Noah Wouters→early',
      'Pieter Janssens→late',
    ]);
    expect(proposal!.payload).toMatchObject({ gaps: [], proposed: 3, rulesFromNotes: 1 });
    expect(proposal!.explanation).toContain('Ik stel 3 van de 3 open plaatsen voor.');
    const liesNow = (await board()).applications.find((a) => a.id === lies.id)!;
    expect(liesNow.assignments).toMatchObject([{ shiftId: early.id, status: 'proposed' }]);

    // Take over the late shift's chips: proposed assignments by the organizer, from Mila's card.
    const lateOnes = proposal!.payload.placements.filter(
      (p: { shiftId: string }) => p.shiftId === late.id,
    );
    expect(
      await ok(
        admin.post(url(`ai/planning/suggestions/${proposal!.id}/accept-placements`), {
          placements: lateOnes,
        }),
        200,
      ),
    ).toEqual({ placed: 2, skipped: 0 });
    const after = await board();
    expect(after.shifts.find((s) => s.id === late.id)!.assignedCount).toBe(2);
    const created = (await logOf('assignment')).filter((row) => row.sourceType === 'ai_suggestion');
    expect(created).toHaveLength(2);
    const [left] = await suggestions('allocation');
    expect(left!.payload).toMatchObject({ accepted: 2, placements: [{ shiftId: early.id }] });

    // Dropping the last chip settles the card: partly taken over counts as accepted.
    await ok(
      admin.post(url(`ai/planning/suggestions/${proposal!.id}/discard-placements`), {
        placements: left!.payload.placements,
      }),
      204,
    );
    expect(await suggestions('allocation')).toEqual([]);
    // Nobody was emailed: nothing is published.
    expect(t.emails.sent.filter((mail) => mail.to !== 'ada@example.com')).toEqual([]);

    // Confirming the note's rule keeps it, as said by the volunteer.
    const pieter = await volunteerId('Pieter Janssens');
    await ok(
      admin.post(url(`ai/planning/suggestions/${card!.id}/accept-rule`), {
        rule: { kind: 'not_before', scope: 'event', volunteerId: pieter, time: '18:00' },
      }),
      204,
    );
    expect(await ok<{ source: string }[]>(admin.get(url('planning-rules')), 200)).toMatchObject([
      { source: 'volunteer_note' },
    ]);
  });

  it('skips placements the board no longer allows, and replaces an open proposal', async () => {
    const { late } = await setUp();
    await runMila('allocation');
    const [first] = await suggestions('allocation');
    await runMila('allocation');
    const [second] = await suggestions('allocation');
    expect(second!.id).not.toBe(first!.id);
    expect(await suggestions('allocation')).toHaveLength(1);

    // Someone fills the late shift by hand meanwhile.
    const extra = await addVolunteer('Finn Aerts', { availableShiftIds: [late.id] });
    const lies = (await board()).applications.find((a) => a.name === 'Lies Maes')!;
    await ok(admin.post(url('assignments'), { applicationId: extra.id, shiftId: late.id }), 204);
    await ok(
      admin.post(url('assignments'), {
        applicationId: lies.id,
        shiftId: late.id,
        acknowledgeWarnings: true,
      }),
      204,
    );

    const result = await ok<{ placed: number; skipped: number }>(
      admin.post(url(`ai/planning/suggestions/${second!.id}/accept-placements`), {
        placements: second!.payload.placements,
      }),
      200,
    );
    expect(result).toEqual({ placed: 1, skipped: 2 });
  });

  it('calls no model when nobody wrote a note', async () => {
    const bar = await createTeam('Bar');
    const shift = await createShift(bar.id, '14:00', '18:00', 1);
    await addVolunteer('Emma Claes', { availableShiftIds: [shift.id] });
    const run = await runMila('allocation');
    expect(calls).toEqual([]);
    expect(run.model).toBe('none');
    expect((await suggestions('allocation'))[0]!.payload.placements).toHaveLength(1);
  });
});
