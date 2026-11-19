import { describe, expect, it } from 'vitest';
import type { ScheduleEntry } from '../../db/schema/index.js';
import {
  checkPlacement,
  overlaps,
  publicSlug,
  registrationClosedReason,
  requiredShiftCount,
  scheduleNotice,
  shiftWindow,
  shiftsOutside,
} from './planning-rules.js';

const at = (time: string) => new Date(`2026-12-12T${time}:00+01:00`);
const slot = (id: string, from: string, to: string, capacity = 2) => ({
  id,
  startsAt: at(from),
  endsAt: at(to),
  capacity,
});

describe('shiftWindow', () => {
  const event = { startsAt: at('14:00'), endsAt: at('23:00') };

  it('is the event itself without setup or teardown', () => {
    expect(shiftWindow({ ...event, setupStartsAt: null, teardownEndsAt: null })).toEqual(event);
  });

  it('stretches to setup and teardown', () => {
    expect(
      shiftWindow({ ...event, setupStartsAt: at('09:00'), teardownEndsAt: at('23:30') }),
    ).toEqual({ startsAt: at('09:00'), endsAt: at('23:30') });
  });

  it('finds the shifts a smaller window would leave out', () => {
    const shifts = [slot('a', '14:00', '18:00'), slot('b', '20:00', '23:00')];
    const outside = shiftsOutside(shifts, { startsAt: at('14:00'), endsAt: at('22:00') });
    expect(outside.map((s) => s.id)).toEqual(['b']);
  });
});

describe('overlaps', () => {
  it('treats back-to-back shifts as not overlapping', () => {
    expect(overlaps(slot('a', '18:00', '21:00'), slot('b', '21:00', '23:00'))).toBe(false);
    expect(overlaps(slot('a', '18:00', '21:00'), slot('b', '20:59', '23:00'))).toBe(true);
  });
});

describe('checkPlacement', () => {
  const application = { wholeEvent: false, availableShiftIds: ['bar'] };

  it('has nothing to say about a free, available shift', () => {
    expect(
      checkPlacement({
        target: slot('bar', '18:00', '21:00'),
        assignedCount: 1,
        otherShifts: [],
        application,
      }),
    ).toEqual({ overlapsWith: null, warnings: [] });
  });

  it('warns about a full shift and one the volunteer did not mark', () => {
    expect(
      checkPlacement({
        target: slot('kassa', '18:00', '21:00', 1),
        assignedCount: 1,
        otherShifts: [],
        application,
      }).warnings,
    ).toEqual(['over_capacity', 'not_available']);
  });

  it('counts every shift as available for the whole event', () => {
    expect(
      checkPlacement({
        target: slot('kassa', '18:00', '21:00'),
        assignedCount: 0,
        otherShifts: [],
        application: { wholeEvent: true, availableShiftIds: [] },
      }).warnings,
    ).toEqual([]);
  });

  it('names the shift the volunteer already has at that time', () => {
    expect(
      checkPlacement({
        target: slot('bar', '18:00', '21:00'),
        assignedCount: 0,
        otherShifts: [slot('parking', '20:00', '22:00')],
        application,
      }).overlapsWith,
    ).toBe('parking');
  });
});

describe('requiredShiftCount', () => {
  it('never asks for more shifts than there are', () => {
    expect(requiredShiftCount(2, 5)).toBe(2);
    expect(requiredShiftCount(3, 1)).toBe(1);
  });
});

describe('scheduleNotice', () => {
  const entry = (shiftId: string, startsAt = '2026-12-12T17:00:00.000Z'): ScheduleEntry => ({
    shiftId,
    teamName: 'Bar',
    startsAt,
    endsAt: '2026-12-12T20:00:00.000Z',
    meetingPoint: null,
  });

  it('sends the first schedule, and nothing when it is unchanged', () => {
    expect(scheduleNotice([entry('a')], null, true)).toBe('schedule');
    expect(scheduleNotice([entry('a'), entry('b')], [entry('b'), entry('a')], true)).toBeNull();
  });

  it('sends an update when a shift or its time changed', () => {
    expect(scheduleNotice([entry('a'), entry('b')], [entry('a')], true)).toBe('updated');
    expect(scheduleNotice([entry('a', '2026-12-12T18:00:00.000Z')], [entry('a')], true)).toBe(
      'updated',
    );
  });

  it('tells volunteers they were taken off, or are not needed (once, when asked)', () => {
    expect(scheduleNotice([], [entry('a')], false)).toBe('removed');
    expect(scheduleNotice([], null, true)).toBe('not_needed');
    expect(scheduleNotice([], null, false)).toBeNull();
    expect(scheduleNotice([], [], true)).toBeNull();
  });

  it('sends a full schedule to someone who was told they were not needed', () => {
    expect(scheduleNotice([entry('a')], [], true)).toBe('schedule');
  });
});

describe('registrationClosedReason', () => {
  const now = at('12:00');
  const open = { status: 'published' as const, registrationOpen: true, registrationDeadline: null };

  it('is open when published, opened and before the deadline', () => {
    expect(registrationClosedReason(open, now)).toBeNull();
    expect(
      registrationClosedReason({ ...open, registrationDeadline: at('13:00') }, now),
    ).toBeNull();
  });

  it('says why it is closed', () => {
    expect(registrationClosedReason({ ...open, status: 'draft' }, now)).toBe('not_published');
    expect(registrationClosedReason({ ...open, registrationOpen: false }, now)).toBe('not_open');
    expect(registrationClosedReason({ ...open, registrationDeadline: at('12:00') }, now)).toBe(
      'deadline_passed',
    );
  });
});

describe('publicSlug', () => {
  it('makes a readable slug with the suffix', () => {
    expect(publicSlug('Kerstmarkt 2026', 'x7k2')).toBe('kerstmarkt-2026-x7k2');
    expect(publicSlug('Café Déjà-vu!', 'ab12')).toBe('cafe-deja-vu-ab12');
    expect(publicSlug('!!!', 'ab12')).toBe('ab12');
  });
});
