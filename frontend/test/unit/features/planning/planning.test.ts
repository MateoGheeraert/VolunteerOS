import { describe, expect, it } from 'vitest';
import type { Application, Shift } from '@/api/generated/types.gen';
import {
  checkPlacement,
  coverage,
  filterVolunteers,
  publishReadiness,
  shiftDays,
  sortVolunteers,
  teamCoverage,
} from '@/features/planning/planning-rules';
import {
  publicRegistrationFormSchemaFor,
  toShiftBody,
  toShiftFormValues,
} from '@/features/planning/schemas';

const TEAM = '00000000-0000-4000-8000-000000000001';

const shift = (id: string, from: string, to: string, capacity = 1, assignedCount = 0): Shift => ({
  id,
  eventId: 'e',
  teamId: TEAM,
  meetingPoint: null,
  startsAt: from,
  endsAt: to,
  capacity,
  assignedCount,
  confirmedCount: 0,
  createdAt: '',
  updatedAt: '',
});

const application = (
  id: string,
  name: string,
  assignments: { id: string; shiftId: string }[] = [],
  available: string[] = [],
): Application => ({
  id,
  eventId: 'e',
  volunteerId: id,
  name,
  email: null,
  phone: null,
  source: 'manual',
  availableShiftIds: available,
  wholeEvent: false,
  preferredTeamId: null,
  notes: null,
  consentedAt: null,
  pendingNotice: null,
  hasSentSchedule: false,
  createdAt: '',
  updatedAt: '',
  assignments: assignments.map((a) => ({
    ...a,
    applicationId: id,
    status: 'proposed' as const,
    assignedByUserId: null,
    issues: [],
    createdAt: '',
    updatedAt: '',
  })),
});

describe('checkPlacement', () => {
  const early = shift('early', '2026-12-12T17:00:00Z', '2026-12-12T20:00:00Z');
  const late = shift('late', '2026-12-12T20:00:00Z', '2026-12-12T22:00:00Z');
  const middle = shift('middle', '2026-12-12T19:00:00Z', '2026-12-12T21:00:00Z');

  it('refuses a shift at the same time as another of the volunteer', () => {
    const jan = application('jan', 'Jan', [{ id: 'a1', shiftId: 'early' }], ['middle']);
    const planning = { shifts: [early, late, middle], applications: [jan] };
    expect(checkPlacement(planning, jan, middle).clash?.id).toBe('early');
    expect(checkPlacement(planning, jan, late).clash).toBeNull();
    // Moving the early assignment itself to the middle shift is fine.
    expect(checkPlacement(planning, jan, middle, 'a1').clash).toBeNull();
  });

  it('warns about full shifts and shifts the volunteer did not mark', () => {
    const jan = application('jan', 'Jan', [{ id: 'a1', shiftId: 'early' }], ['early']);
    const mia = application('mia', 'Mia', [], ['late']);
    const planning = { shifts: [early, late], applications: [jan, mia] };
    expect(checkPlacement(planning, mia, early).warnings).toEqual([
      'over_capacity',
      'not_available',
    ]);
    expect(checkPlacement(planning, mia, late).warnings).toEqual([]);
  });
});

describe('coverage', () => {
  it('colours shifts by how full they are', () => {
    expect(coverage(0, 3)).toBe('empty');
    expect(coverage(2, 3)).toBe('partial');
    expect(coverage(3, 3)).toBe('full');
    expect(coverage(4, 3)).toBe('over');
  });

  it('caps each shift in the team total so an overfull shift hides no gap', () => {
    expect(teamCoverage([shift('a', '', '', 2, 4), shift('b', '', '', 3, 1)])).toEqual({
      filled: 3,
      capacity: 5,
    });
  });
});

describe('publishReadiness', () => {
  const full = shift('full', '2026-12-12T17:00:00Z', '2026-12-12T20:00:00Z', 1, 1);
  const open = shift('open', '2026-12-12T20:00:00Z', '2026-12-12T22:00:00Z', 2, 0);

  it('is not ready without shifts', () => {
    expect(publishReadiness({ shifts: [], applications: [] }).ready).toBe(false);
  });

  it('counts open spots and proposals', () => {
    const jan = application('jan', 'Jan', [{ id: 'a1', shiftId: 'full' }]);
    expect(publishReadiness({ shifts: [full, open], applications: [jan] })).toEqual({
      openSpots: 2,
      proposed: 1,
      ready: false,
    });
  });

  it('is ready when every shift is full and confirmed', () => {
    const jan = application('jan', 'Jan', [{ id: 'a1', shiftId: 'full' }]);
    jan.assignments[0]!.status = 'confirmed';
    expect(publishReadiness({ shifts: [full], applications: [jan] }).ready).toBe(true);
  });
});

describe('days and volunteers', () => {
  it('puts a shift past midnight on the day it starts', () => {
    expect(
      shiftDays([
        shift('a', '2026-12-12T21:00:00Z', '2026-12-13T01:00:00Z'),
        shift('b', '2026-12-13T09:00:00Z', '2026-12-13T12:00:00Z'),
      ]),
    ).toEqual(['2026-12-12', '2026-12-13']);
  });

  it('lists volunteers who still need shifts first, and filters them', () => {
    const event = { volunteerCommitment: 'shifts' as const, shiftsPerVolunteer: 1 };
    const sorted = sortVolunteers(
      [
        application('a', 'Anna', [{ id: 'x', shiftId: 's' }]),
        application('b', 'Bram'),
        application('c', 'Cas'),
      ],
      event,
    );
    expect(sorted.map((a) => a.name)).toEqual(['Bram', 'Cas', 'Anna']);
    expect(filterVolunteers(sorted, { search: 'ca', teamId: 'all' }).map((a) => a.name)).toEqual([
      'Cas',
    ]);
  });
});

describe('shift form', () => {
  it('puts an end time before the start time on the next day, and back', () => {
    const body = toShiftBody({
      teamId: TEAM,
      date: '2026-12-12',
      startTime: '22:00',
      endTime: '02:00',
      capacity: '4',
      meetingPoint: '',
    });
    expect(body).toMatchObject({
      startsAt: '2026-12-12T21:00:00.000Z',
      endsAt: '2026-12-13T01:00:00.000Z',
      capacity: 4,
      meetingPoint: null,
    });
    expect(toShiftFormValues({ ...body, meetingPoint: null })).toMatchObject({
      date: '2026-12-12',
      startTime: '22:00',
      endTime: '02:00',
    });
  });
});

describe('public registration form', () => {
  const values = {
    name: 'Jan',
    email: 'jan@example.com',
    phone: '',
    availableShiftIds: [TEAM],
    wholeEvent: false,
    preferredTeamId: '',
    notes: '',
    consent: true,
    website: '',
  };

  it('asks for the number of shifts the event needs, unless available all event', () => {
    const schema = publicRegistrationFormSchemaFor(2, 'shifts');
    expect(schema.safeParse(values).success).toBe(false);
    expect(schema.safeParse({ ...values, wholeEvent: true }).success).toBe(true);
  });

  it('requires the privacy consent', () => {
    const schema = publicRegistrationFormSchemaFor(1, 'shifts');
    expect(schema.safeParse({ ...values, consent: false }).success).toBe(false);
  });
});
