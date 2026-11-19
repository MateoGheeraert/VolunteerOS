import { describe, expect, it } from 'vitest';
import type { Event } from '@/api/generated/types.gen';
import {
  editionOptions,
  eventFormSchema as schema,
  toEventBody,
  toEventFormValues,
  type EventFormValues,
} from '@/features/events/schemas';

const valid: EventFormValues = {
  name: 'Kerstmarkt 2026',
  eventType: 'market',
  description: '',
  location: 'Dorpsplein Merkem',
  date: '2026-12-19',
  startTime: '14:00',
  endDate: '2026-12-19',
  endTime: '23:00',
  setupDate: '',
  setupTime: '',
  teardownDate: '',
  teardownTime: '',
  previousEditionId: '',
  expectedAttendance: '',
  actualAttendance: '',
  retrospective: '',
};

describe('eventFormSchema', () => {
  it('accepts a normal event', () => {
    expect(schema.safeParse(valid).success).toBe(true);
  });

  it('requires a name', () => {
    const result = schema.safeParse({ ...valid, name: '   ' });
    expect(result.error?.issues[0]?.message).toBe('eventForm.validation.nameRequired');
  });

  it('takes the name limit from the generated API schema', () => {
    expect(schema.safeParse({ ...valid, name: 'x'.repeat(201) }).success).toBe(false);
    expect(schema.safeParse({ ...valid, name: 'x'.repeat(200) }).success).toBe(true);
  });

  it('requires an event type', () => {
    const result = schema.safeParse({ ...valid, eventType: '' });
    expect(result.error?.issues[0]?.message).toBe('eventForm.validation.typeRequired');
  });

  it('rejects identical start and end times on one day', () => {
    const result = schema.safeParse({ ...valid, endTime: '14:00' });
    expect(result.error?.issues[0]?.path).toEqual(['endTime']);
  });

  it('accepts identical times on different days', () => {
    expect(schema.safeParse({ ...valid, endDate: '2026-12-20', endTime: '14:00' }).success).toBe(
      true,
    );
  });

  it('rejects an end date before the start date', () => {
    const result = schema.safeParse({ ...valid, endDate: '2026-12-18' });
    expect(result.error?.issues[0]?.path).toEqual(['endDate']);
    expect(result.error?.issues[0]?.message).toBe('eventForm.validation.endDateBeforeStart');
  });

  it('rejects malformed times', () => {
    expect(schema.safeParse({ ...valid, startTime: '25:00' }).success).toBe(false);
  });

  it('accepts empty or whole-number attendance only', () => {
    expect(schema.safeParse({ ...valid, expectedAttendance: '1500' }).success).toBe(true);
    expect(schema.safeParse({ ...valid, expectedAttendance: '-3' }).success).toBe(false);
    expect(schema.safeParse({ ...valid, actualAttendance: '12.5' }).success).toBe(false);
    expect(schema.safeParse({ ...valid, actualAttendance: 'veel' }).success).toBe(false);
  });

  it('accepts no previous edition or an event id', () => {
    const id = '0b6a7c1e-2f43-4d8a-9c55-3e1f2a7b9d10';
    expect(schema.safeParse({ ...valid, previousEditionId: id }).success).toBe(true);
    expect(schema.safeParse({ ...valid, previousEditionId: 'nope' }).success).toBe(false);
  });
});

describe('setup and teardown', () => {
  it('are optional, but need both a date and a time', () => {
    expect(schema.safeParse({ ...valid, setupDate: '2026-12-19' }).success).toBe(false);
    expect(
      schema.safeParse({ ...valid, setupDate: '2026-12-19', setupTime: '09:00' }).success,
    ).toBe(true);
  });

  it('must fall before the start and after the end (past midnight included)', () => {
    expect(
      schema.safeParse({ ...valid, setupDate: '2026-12-19', setupTime: '15:00' }).success,
    ).toBe(false);
    const night = { ...valid, startTime: '20:00', endTime: '02:00' };
    expect(
      schema.safeParse({ ...night, teardownDate: '2026-12-20', teardownTime: '01:00' }).success,
    ).toBe(false);
    expect(
      schema.safeParse({ ...night, teardownDate: '2026-12-20', teardownTime: '04:00' }).success,
    ).toBe(true);
  });

  it('are sent as UTC, or null when empty', () => {
    expect(toEventBody(valid)).toMatchObject({ setupStartsAt: null, teardownEndsAt: null });
    expect(
      toEventBody({ ...valid, setupDate: '2026-12-19', setupTime: '09:00' }).setupStartsAt,
    ).toBe('2026-12-19T08:00:00.000Z');
  });
});

describe('toEventBody', () => {
  it('converts Brussels times to UTC', () => {
    expect(toEventBody(valid)).toMatchObject({
      startsAt: '2026-12-19T13:00:00.000Z',
      endsAt: '2026-12-19T22:00:00.000Z',
      description: null,
      eventType: 'market',
      previousEditionId: null,
      expectedAttendance: null,
    });
  });

  it('moves an end time before the start to the next day on a single-day event', () => {
    const body = toEventBody({ ...valid, startTime: '20:00', endTime: '02:00' });
    expect(body.endsAt).toBe('2026-12-20T01:00:00.000Z');
  });

  it('handles the next day across a month end', () => {
    const body = toEventBody({
      ...valid,
      date: '2026-12-31',
      endDate: '2026-12-31',
      startTime: '21:00',
      endTime: '03:00',
    });
    expect(body.endsAt).toBe('2027-01-01T02:00:00.000Z');
  });

  it('takes the times literally when the event ends on a later day', () => {
    const weekend = toEventBody({
      ...valid,
      date: '2026-12-18',
      startTime: '17:00',
      endDate: '2026-12-20',
      endTime: '20:00',
    });
    expect(weekend.startsAt).toBe('2026-12-18T16:00:00.000Z');
    expect(weekend.endsAt).toBe('2026-12-20T19:00:00.000Z');

    // Ending earlier in the day than it started does not add yet another day.
    const early = toEventBody({
      ...valid,
      endDate: '2026-12-21',
      startTime: '20:00',
      endTime: '02:00',
    });
    expect(early.endsAt).toBe('2026-12-21T01:00:00.000Z');
  });

  it('sends counts as numbers and empty fields as null', () => {
    const body = toEventBody({
      ...valid,
      expectedAttendance: '800',
      actualAttendance: '0',
      retrospective: 'Meer glühwein.',
      previousEditionId: '0b6a7c1e-2f43-4d8a-9c55-3e1f2a7b9d10',
    });
    expect(body).toMatchObject({
      expectedAttendance: 800,
      actualAttendance: 0,
      retrospective: 'Meer glühwein.',
      previousEditionId: '0b6a7c1e-2f43-4d8a-9c55-3e1f2a7b9d10',
    });
  });
});

describe('toEventFormValues', () => {
  const roundTrip = (values: EventFormValues) => toEventFormValues(toEventBody(values));

  it('shows a past-midnight event on one date, as it was entered', () => {
    const overnight = { ...valid, startTime: '20:00', endTime: '02:00' };
    expect(roundTrip(overnight)).toEqual(overnight);
  });

  it('round-trips a multi-day event', () => {
    const weekend = { ...valid, date: '2026-12-18', endDate: '2026-12-20', endTime: '20:00' };
    expect(roundTrip(weekend)).toEqual(weekend);
  });

  it('round-trips a next-day end later than the start as a two-day event', () => {
    const long = { ...valid, startTime: '10:00', endDate: '2026-12-20', endTime: '12:00' };
    expect(roundTrip(long)).toEqual(long);
  });

  it('round-trips the new fields', () => {
    const full = {
      ...valid,
      eventType: 'quiz' as const,
      expectedAttendance: '120',
      actualAttendance: '134',
      retrospective: 'Meer tafels.',
      previousEditionId: '0b6a7c1e-2f43-4d8a-9c55-3e1f2a7b9d10',
    };
    expect(roundTrip(full)).toEqual(full);
  });
});

describe('editionOptions', () => {
  const event = (id: string, startsAt: string, previousEditionId: string | null = null) =>
    ({ id, name: `Event ${id}`, startsAt, previousEditionId }) as Event;

  const events = [
    event('a', '2024-12-14T13:00:00.000Z'),
    event('b', '2025-12-13T13:00:00.000Z', 'a'),
    event('c', '2026-12-19T13:00:00.000Z', 'b'),
    event('d', '2026-06-01T10:00:00.000Z'),
  ];

  it('offers every event except itself and editions already continued, newest first', () => {
    expect(editionOptions(events).map((option) => option.id)).toEqual(['c', 'd']);
  });

  it('keeps the edition the event itself continues', () => {
    expect(editionOptions(events, 'c').map((option) => option.id)).toEqual(['d', 'b']);
  });
});
