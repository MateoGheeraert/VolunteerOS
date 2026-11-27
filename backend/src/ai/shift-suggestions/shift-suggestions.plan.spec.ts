import { describe, expect, it } from 'vitest';
import { buildShiftSuggestionContext, moveShift } from './shift-suggestions.context.js';
import { planShiftSuggestions, toSlot } from './shift-suggestions.plan.js';
import type { ShiftSuggestionOutput } from './shift-suggestions.schema.js';
import { headcount, STAFFING_CATALOGUE } from './staffing-catalogue.js';

// 19 December 2026, Brussels winter time (UTC+1).
const local = (day: string, time: string) => new Date(`${day}T${time}:00+01:00`);
const window = { startsAt: local('2026-12-18', '17:00'), endsAt: local('2026-12-19', '23:00') };

const ids = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function context(withTeams = true) {
  return buildShiftSuggestionContext({
    language: 'nl-BE',
    today: '2026-11-25',
    event: {
      id: ids(1),
      name: 'Kerstmarkt 2026',
      eventType: 'market',
      startsAt: local('2026-12-19', '14:00'),
      endsAt: local('2026-12-19', '23:00'),
      windowStartsAt: window.startsAt,
      windowEndsAt: window.endsAt,
      expectedAttendance: 800,
      volunteerCount: 12,
      shiftsPerVolunteer: 1,
    },
    previousEdition: {
      id: ids(2),
      name: 'Kerstmarkt 2025',
      startsAt: local('2025-12-20', '14:00'),
      expectedAttendance: 600,
      actualAttendance: 720,
      retrospective: null,
      teams: [
        {
          id: ids(3),
          name: 'Afbraak',
          description: null,
          defaultMeetingPoint: null,
          shifts: [
            {
              id: ids(4),
              startsAt: local('2025-12-20', '22:00'),
              endsAt: local('2025-12-20', '23:00'),
              capacity: 5,
              assigned: 5,
            },
          ],
        },
      ],
    },
    currentTeams: withTeams
      ? [
          {
            id: ids(10),
            name: 'Bar',
            description: null,
            defaultMeetingPoint: null,
            shifts: [
              {
                id: ids(11),
                startsAt: local('2026-12-19', '17:00'),
                endsAt: local('2026-12-19', '22:00'),
                capacity: 4,
                assigned: 2,
              },
            ],
          },
        ]
      : [],
    earlierSuggestions: [],
  });
}

const output = (overrides: Partial<ShiftSuggestionOutput>): ShiftSuggestionOutput => ({
  newTeams: [],
  changes: [],
  ...overrides,
});

const team = (
  name: string,
  shifts: ShiftSuggestionOutput['newTeams'][number]['shifts'],
  cites = ['PT1'],
) => ({ name, description: null, meetingPoint: null, shifts, reason: 'Vorig jaar ook.', cites });

describe('moveShift', () => {
  it('keeps the day relative to the start and the Brussels clock time', () => {
    const moved = moveShift(local('2025-12-20', '14:00'), local('2026-12-19', '14:00'), {
      startsAt: local('2025-12-19', '17:00'),
      endsAt: local('2025-12-19', '20:00'),
    });
    expect(moved).toEqual({
      startsAt: local('2026-12-18', '17:00'),
      endsAt: local('2026-12-18', '20:00'),
    });
  });

  it('keeps the clock time across a change to summer time', () => {
    const moved = moveShift(
      new Date('2026-03-21T10:00:00+01:00'),
      new Date('2027-04-03T10:00:00+02:00'),
      {
        startsAt: new Date('2026-03-21T09:00:00+01:00'),
        endsAt: new Date('2026-03-21T12:00:00+01:00'),
      },
    );
    expect(moved.startsAt.toISOString()).toBe('2027-04-03T07:00:00.000Z');
  });
});

describe('buildShiftSuggestionContext', () => {
  it('numbers previous teams, moved shifts, current shifts and the catalogue', () => {
    const { prompt, refs, teamRefs, shiftRefs } = context();
    expect(prompt).toContain('[PT1] Afbraak');
    expect(prompt).toContain('[PS1] 2026-12-19 (Sat) 22:00–23:00, capacity 5 (5 placed)');
    expect(prompt).toContain('[T1] Bar');
    expect(prompt).toContain('[C2] Bar (during)');
    expect(refs.get('C1')).toMatchObject({ type: 'catalogue', label: 'Opbouw' });
    expect(teamRefs.get('T1')).toEqual({ id: ids(10), name: 'Bar' });
    expect(shiftRefs.get('S1')?.capacity).toBe(4);
    expect(prompt).not.toContain(ids(10));
  });
});

describe('headcount', () => {
  const [opbouw, bar] = STAFFING_CATALOGUE.market;
  it('scales flow teams with visitors per hour at the peak', () => {
    // 800 over 9 hours ≈ 89/h, × 2.5 at the peak ≈ 222/h, / 75 → 3.
    expect(headcount(bar!, 800, 9)).toBe(3);
  });
  it('keeps fixed teams fixed and falls back to the minimum without attendance', () => {
    expect(headcount(opbouw!, 5000, 9)).toBe(6);
    expect(headcount(bar!, null, 9)).toBe(bar!.min);
  });
});

describe('toSlot', () => {
  it('reads an end before the start as past midnight', () => {
    const wide = { startsAt: local('2026-12-18', '00:00'), endsAt: local('2026-12-20', '06:00') };
    expect(toSlot('2026-12-19', '22:00', '02:00', wide)).toEqual({
      startsAt: local('2026-12-19', '22:00'),
      endsAt: local('2026-12-20', '02:00'),
      requested: null,
    });
  });
  it('refuses invalid times and shifts outside the window', () => {
    expect(toSlot('2026-12-19', '25:00', '26:00', window)).toBeNull();
    expect(toSlot('19/12', '14:00', '18:00', window)).toBeNull();
    expect(toSlot('2026-12-19', '22:00', '23:30', window)).toBeNull();
  });

  it('cuts a shift that runs past the event to its hours, keeping the times asked for', () => {
    expect(toSlot('2026-12-19', '21:00', '01:00', window, { trim: true })).toEqual({
      startsAt: local('2026-12-19', '21:00'),
      endsAt: local('2026-12-19', '23:00'),
      requested: { startsAt: local('2026-12-19', '21:00'), endsAt: local('2026-12-20', '01:00') },
    });
    // Less than an hour left inside the event: dropped.
    expect(toSlot('2026-12-19', '22:30', '01:00', window, { trim: true })).toBeNull();
    expect(toSlot('2026-12-20', '01:00', '03:00', window, { trim: true })).toBeNull();
  });
});

describe('planShiftSuggestions', () => {
  const plan = (out: ShiftSuggestionOutput, withTeams = true) => {
    const ctx = context(withTeams);
    return planShiftSuggestions(out, ctx.refs, {
      window,
      existingTeamNames: withTeams ? ['Bar'] : [],
      teamRefs: ctx.teamRefs,
      shiftRefs: ctx.shiftRefs,
    });
  };

  it('turns a new team into one card with its shifts', () => {
    const result = plan(
      output({
        newTeams: [
          team('Afbraak', [
            { day: '2026-12-19', start: '22:00', end: '23:00', capacity: 5 },
            { day: '2026-12-19', start: '22:00', end: '23:00', capacity: 5 },
          ]),
        ],
      }),
    );
    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]).toMatchObject({
      kind: 'team_suggestion',
      dedupKey: 'team:afbraak',
      payload: {
        name: 'Afbraak',
        shifts: [
          {
            startsAt: local('2026-12-19', '22:00').toISOString(),
            endsAt: local('2026-12-19', '23:00').toISOString(),
            capacity: 5,
          },
        ],
      },
      citations: [{ type: 'team', id: ids(3) }],
    });
  });

  it('drops uncited teams, invented references and teams that exist', () => {
    const shift = { day: '2026-12-19', start: '14:00', end: '18:00', capacity: 2 };
    const result = plan(
      output({
        newTeams: [
          team('Kassa', [shift], []),
          team('Kassa', [shift], ['X9']),
          team('bar', [shift], ['E']),
        ],
      }),
    );
    expect(result.cards).toEqual([]);
    expect(result.dropped.map((d) => d.reason)).toEqual(['unbacked', 'unbacked', 'exists']);
  });

  it('drops a team whose shifts all fall outside the event', () => {
    const result = plan(
      output({
        newTeams: [
          team('Kassa', [{ day: '2026-12-25', start: '14:00', end: '18:00', capacity: 2 }], ['C3']),
        ],
      }),
    );
    expect(result.dropped).toEqual([
      { kind: 'team_suggestion', title: 'Kassa', reason: 'invalid' },
    ]);
  });

  it('turns a capacity change into a card with the numbers', () => {
    const result = plan(
      output({
        changes: [
          {
            team: 'T1',
            type: 'capacity',
            shift: 'S1',
            day: null,
            start: null,
            end: null,
            capacity: 6,
            reason: '800 bezoekers.',
            cites: ['E', 'S1'],
          },
        ],
      }),
    );
    expect(result.cards[0]).toMatchObject({
      kind: 'shift_change',
      dedupKey: `shift:capacity:${ids(11)}:6`,
      title: 'Bar 17:00–22:00: 4 → 6',
      payload: { type: 'capacity', shiftId: ids(11), fromCapacity: 4, capacity: 6 },
    });
  });

  it('drops a change that changes nothing or names another team’s shift', () => {
    const base = { day: null, start: null, end: null, reason: '', cites: ['E'] };
    const result = plan(
      output({
        changes: [
          { ...base, team: 'T1', type: 'capacity', shift: 'S1', capacity: 4 },
          { ...base, team: 'T2', type: 'capacity', shift: 'S1', capacity: 6 },
        ],
      }),
    );
    expect(result.dropped.map((d) => d.reason)).toEqual(['no_change', 'unbacked']);
  });

  it('adds an extra shift, but not one that already starts then', () => {
    const base = {
      team: 'T1',
      type: 'add_shift' as const,
      shift: null,
      capacity: 3,
      reason: '',
      cites: ['C2'],
    };
    const result = plan(
      output({
        changes: [
          { ...base, day: '2026-12-19', start: '14:00', end: '17:00' },
          { ...base, day: '2026-12-19', start: '17:00', end: '22:00' },
        ],
      }),
    );
    expect(result.cards.map((c) => c.title)).toEqual(['Bar: extra shift 14:00–17:00']);
    expect(result.dropped).toEqual([{ kind: 'shift_change', title: 'Bar', reason: 'exists' }]);
  });
});
