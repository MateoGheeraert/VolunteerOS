import { describe, expect, it } from 'vitest';
import {
  allocate,
  checkPlacements,
  eventClock,
  type SolverInput,
  type SolverShift,
  type SolverVolunteer,
} from './allocation.js';

/** A shift on 12 December, times as Brussels clock times (winter: UTC+1). */
function shift(id: string, team: string, from: string, to: string, capacity = 1): SolverShift {
  const [fh, fm] = from.split(':').map(Number) as [number, number];
  const [th, tm] = to.split(':').map(Number) as [number, number];
  return {
    id,
    teamId: `team-${team.toLowerCase()}`,
    teamName: team,
    startsAt: new Date(`2026-12-12T${from}:00+01:00`),
    endsAt: new Date(`2026-12-12T${to}:00+01:00`),
    capacity,
    startClock: fh * 60 + fm,
    endClock: th * 60 + tm,
  };
}

function person(
  name: string,
  shifts: string[],
  extra: Partial<SolverVolunteer> = {},
): SolverVolunteer {
  return {
    applicationId: `app-${name}`,
    volunteerId: `vol-${name}`,
    name,
    wholeEvent: false,
    availableShiftIds: shifts,
    preferredTeamId: null,
    previousTeams: [],
    ...extra,
  };
}

const input = (overrides: Partial<SolverInput>): SolverInput => ({
  shifts: [],
  volunteers: [],
  assignments: [],
  maxShiftsPerVolunteer: 1,
  rules: [],
  ...overrides,
});

const placed = (result: ReturnType<typeof allocate>) =>
  result.placements.map((p) => `${p.applicationId.slice(4)}→${p.shiftId}`).sort();

describe('allocate', () => {
  const barEarly = shift('bar-early', 'Bar', '13:00', '17:00', 2);
  const barLate = shift('bar-late', 'Bar', '17:00', '22:00', 2);
  const kassa = shift('kassa', 'Kassa', '13:00', '17:00', 1);

  it('places volunteers on shifts they marked, never on others', () => {
    const result = allocate(
      input({
        shifts: [barEarly, kassa],
        volunteers: [person('Emma', ['bar-early']), person('Noah', ['kassa'])],
      }),
    );
    expect(placed(result)).toEqual(['Emma→bar-early', 'Noah→kassa']);
  });

  it('treats whole-event volunteers as available everywhere', () => {
    const result = allocate(
      input({ shifts: [kassa], volunteers: [person('Emma', [], { wholeEvent: true })] }),
    );
    expect(placed(result)).toEqual(['Emma→kassa']);
  });

  it('fills only open places and never moves existing assignments', () => {
    const result = allocate(
      input({
        shifts: [barEarly],
        volunteers: [
          person('Emma', ['bar-early']),
          person('Noah', ['bar-early']),
          person('Lou', ['bar-early']),
        ],
        assignments: [{ applicationId: 'app-Emma', shiftId: 'bar-early' }],
      }),
    );
    // One place left; Emma keeps hers and is not placed again.
    expect(result.placements).toHaveLength(1);
    expect(result.placements[0]!.applicationId).not.toBe('app-Emma');
    expect(result.gaps).toEqual([]);
  });

  it('respects capacity and reports the gap', () => {
    const result = allocate(
      input({ shifts: [barEarly], volunteers: [person('Emma', ['bar-early'])] }),
    );
    expect(placed(result)).toEqual(['Emma→bar-early']);
    expect(result.gaps).toEqual([{ shiftId: 'bar-early', missing: 1, reason: 'nobody_available' }]);
  });

  it('never places someone on two overlapping shifts', () => {
    const result = allocate(
      input({
        shifts: [barEarly, kassa],
        volunteers: [person('Emma', ['bar-early', 'kassa'])],
        maxShiftsPerVolunteer: 2,
      }),
    );
    expect(result.placements).toHaveLength(1);
    expect(result.gaps.map((g) => g.reason)).toContain('busy');
  });

  it('gives nobody more shifts than the event asks', () => {
    const result = allocate(
      input({
        shifts: [barEarly, barLate],
        volunteers: [person('Emma', ['bar-early', 'bar-late'])],
        maxShiftsPerVolunteer: 1,
      }),
    );
    expect(result.placements).toHaveLength(1);
    expect(result.gaps.find((g) => g.shiftId !== result.placements[0]!.shiftId)?.reason).toBe(
      'max_shifts',
    );
  });

  it('lets whole-event volunteers take several shifts that do not overlap', () => {
    const result = allocate(
      input({
        shifts: [barEarly, barLate],
        volunteers: [person('Emma', [], { wholeEvent: true })],
        maxShiftsPerVolunteer: null,
      }),
    );
    expect(placed(result)).toEqual(['Emma→bar-early', 'Emma→bar-late']);
  });

  it('places the most constrained shift first', () => {
    // Emma could do both, Noah only the bar: Emma must end up at the cash desk.
    const result = allocate(
      input({
        shifts: [shift('bar', 'Bar', '13:00', '17:00'), shift('kassa', 'Kassa', '13:00', '17:00')],
        volunteers: [person('Emma', ['bar', 'kassa']), person('Noah', ['bar'])],
      }),
    );
    expect(placed(result)).toEqual(['Emma→kassa', 'Noah→bar']);
  });

  it('prefers the volunteer whose preferred team it is', () => {
    const result = allocate(
      input({
        shifts: [kassa],
        volunteers: [
          person('Anna', ['kassa']),
          person('Zoë', ['kassa'], { preferredTeamId: 'team-kassa' }),
        ],
      }),
    );
    expect(placed(result)).toEqual(['Zoë→kassa']);
    expect(result.placements[0]!.reasons).toEqual(['preferred_team']);
    expect(result.unplaced).toEqual([
      { applicationId: 'app-Anna', missing: 1, reason: 'shifts_full' },
    ]);
  });

  it('prefers the team someone worked in last year', () => {
    const result = allocate(
      input({
        shifts: [kassa],
        volunteers: [
          person('Anna', ['kassa']),
          person('Zoë', ['kassa'], { previousTeams: ['kassa'] }),
        ],
      }),
    );
    expect(result.placements[0]).toMatchObject({
      applicationId: 'app-Zoë',
      reasons: ['previous_team'],
    });
  });

  it('is deterministic: ties go by name', () => {
    const run = () =>
      allocate(
        input({
          shifts: [kassa],
          volunteers: [person('Noah', ['kassa']), person('Emma', ['kassa'])],
        }),
      );
    expect(placed(run())).toEqual(['Emma→kassa']);
    expect(run()).toEqual(run());
  });

  describe('hard rules', () => {
    it('not_team keeps someone out of a team, matched ignoring case', () => {
      const result = allocate(
        input({
          shifts: [kassa],
          volunteers: [person('Emma', ['kassa'])],
          rules: [{ kind: 'not_team', volunteerId: 'vol-Emma', teamName: 'kassa' }],
        }),
      );
      expect(result.placements).toEqual([]);
      expect(result.gaps[0]!.reason).toBe('rules');
      expect(result.unplaced[0]!.reason).toBe('rules');
    });

    it('only_team keeps someone in one team', () => {
      const result = allocate(
        input({
          shifts: [barEarly, kassa],
          volunteers: [person('Emma', ['bar-early', 'kassa'])],
          rules: [{ kind: 'only_team', volunteerId: 'vol-Emma', teamName: 'Kassa' }],
        }),
      );
      expect(placed(result)).toEqual(['Emma→kassa']);
    });

    it('never_together holds both ways, also against existing assignments', () => {
      const result = allocate(
        input({
          shifts: [barEarly],
          volunteers: [person('Emma', ['bar-early']), person('Noah', ['bar-early'])],
          assignments: [{ applicationId: 'app-Noah', shiftId: 'bar-early' }],
          rules: [
            { kind: 'never_together', volunteerId: 'vol-Noah', otherVolunteerId: 'vol-Emma' },
          ],
        }),
      );
      expect(result.placements).toEqual([]);
    });

    it('max_shifts lowers the event limit', () => {
      const result = allocate(
        input({
          shifts: [barEarly, barLate],
          volunteers: [person('Emma', ['bar-early', 'bar-late'])],
          maxShiftsPerVolunteer: 2,
          rules: [{ kind: 'max_shifts', volunteerId: 'vol-Emma', maxShifts: 1 }],
        }),
      );
      expect(result.placements).toHaveLength(1);
    });

    it('not_before and not_after use the Brussels clock', () => {
      const result = allocate(
        input({
          shifts: [barEarly, barLate],
          volunteers: [
            person('Pieter', ['bar-early', 'bar-late']),
            person('Lies', ['bar-early', 'bar-late']),
          ],
          rules: [
            { kind: 'not_before', volunteerId: 'vol-Pieter', time: '17:00' },
            { kind: 'not_after', volunteerId: 'vol-Lies', time: '18:00' },
          ],
        }),
      );
      expect(placed(result)).toEqual(['Lies→bar-early', 'Pieter→bar-late']);
    });

    it('not_after refuses shifts that run past midnight', () => {
      const night = { ...shift('night', 'Afbraak', '22:00', '23:30'), endClock: 26 * 60 };
      const result = allocate(
        input({
          shifts: [night],
          volunteers: [person('Lies', ['night'])],
          rules: [{ kind: 'not_after', volunteerId: 'vol-Lies', time: '23:59' }],
        }),
      );
      expect(result.placements).toEqual([]);
    });

    it('reads a shift after midnight as the same night', () => {
      // 00:30–03:00: "niet na 23:00" refuses it, "niet voor 18:00" allows it.
      const late = { ...shift('late', 'Afbraak', '00:30', '03:00'), startClock: eventClock(30) };
      late.endClock = late.startClock + 150;
      const run = (kind: 'not_after' | 'not_before', time: string) =>
        allocate(
          input({
            shifts: [late],
            volunteers: [person('Lies', ['late'])],
            rules: [{ kind, volunteerId: 'vol-Lies', time }],
          }),
        ).placements.length;
      expect(run('not_after', '23:00')).toBe(0);
      expect(run('not_before', '18:00')).toBe(1);
      expect(run('not_after', '03:00')).toBe(1);
    });
  });

  describe('checkPlacements', () => {
    const early = shift('early', 'Bar', '13:00', '17:00', 2);
    const late = shift('late', 'Bar', '17:00', '22:00', 2);

    it('skips what no longer fits: the shift limit, a rule added since, a full shift', () => {
      const board = input({
        shifts: [early, late],
        volunteers: [person('Jan', ['early', 'late']), person('Piet', ['early', 'late'])],
        // Jan was placed by hand on the early shift after Mila proposed him for the late one.
        assignments: [{ applicationId: 'app-Jan', shiftId: 'early' }],
        rules: [{ kind: 'never_together', volunteerId: 'vol-Piet', otherVolunteerId: 'vol-Jan' }],
      });
      const { allowed, blocked } = checkPlacements(board, [
        { applicationId: 'app-Jan', shiftId: 'late' },
        { applicationId: 'app-Piet', shiftId: 'early' },
        { applicationId: 'app-Piet', shiftId: 'late' },
      ]);
      expect(allowed).toEqual([{ applicationId: 'app-Piet', shiftId: 'late' }]);
      expect(blocked).toHaveLength(2);
    });
  });

  describe('soft rules', () => {
    it('prefers_team weighs like a preferred team', () => {
      const result = allocate(
        input({
          shifts: [kassa],
          volunteers: [person('Anna', ['kassa']), person('Zoë', ['kassa'])],
          rules: [{ kind: 'prefers_team', volunteerId: 'vol-Zoë', teamName: 'Kassa' }],
        }),
      );
      expect(result.placements[0]).toMatchObject({
        applicationId: 'app-Zoë',
        reasons: ['prefers_team'],
      });
    });

    it('prefer_together puts friends on the same shift', () => {
      const result = allocate(
        input({
          shifts: [shift('a', 'Bar', '13:00', '17:00', 2), shift('b', 'Bar', '17:00', '22:00', 2)],
          volunteers: [
            person('Anna', ['a', 'b']),
            person('Bram', ['a', 'b']),
            person('Cas', ['a', 'b']),
            person('Dirk', ['a']),
          ],
          assignments: [{ applicationId: 'app-Dirk', shiftId: 'a' }],
          rules: [
            { kind: 'prefer_together', volunteerId: 'vol-Cas', otherVolunteerId: 'vol-Dirk' },
          ],
        }),
      );
      const cas = result.placements.find((p) => p.applicationId === 'app-Cas');
      expect(cas).toEqual({ applicationId: 'app-Cas', shiftId: 'a', reasons: ['together'] });
    });

    it('spreads shifts: someone without a shift goes before someone with one', () => {
      const result = allocate(
        input({
          shifts: [barEarly, barLate],
          volunteers: [person('Anna', ['bar-early', 'bar-late']), person('Bram', ['bar-late'])],
          assignments: [{ applicationId: 'app-Anna', shiftId: 'bar-early' }],
          maxShiftsPerVolunteer: 2,
        }),
      );
      // Both could take bar-late; Bram has no shift yet, so he gets the first place there.
      expect(result.placements[0]).toMatchObject({
        applicationId: 'app-Bram',
        shiftId: 'bar-late',
      });
    });
  });

  it('reports volunteers who marked nothing', () => {
    const result = allocate(input({ shifts: [kassa], volunteers: [person('Emma', [])] }));
    expect(result.unplaced).toEqual([
      { applicationId: 'app-Emma', missing: 1, reason: 'no_shifts_marked' },
    ]);
  });

  it('counts people outside the list as taking their place', () => {
    const result = allocate(
      input({
        shifts: [kassa],
        volunteers: [person('Emma', ['kassa'])],
        assignments: [{ applicationId: 'app-gone', shiftId: 'kassa' }],
      }),
    );
    expect(result.placements).toEqual([]);
  });
});
