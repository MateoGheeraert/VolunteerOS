import { describe, expect, it } from 'vitest';
import {
  addEventMemberSchema,
  createEventSchema,
  eventSchema,
  updateEventSchema,
} from './events.schemas.js';

const valid = {
  name: 'Kerstmarkt 2026',
  eventType: 'market',
  startsAt: '2026-12-12T14:00:00+01:00',
  endsAt: '2026-12-12T23:00:00+01:00',
};

describe('createEventSchema', () => {
  it('parses ISO dates with an offset into Dates', () => {
    const parsed = createEventSchema.parse(valid);
    expect(parsed.startsAt).toEqual(new Date('2026-12-12T13:00:00Z'));
    expect(parsed.endsAt).toBeInstanceOf(Date);
  });

  it('accepts optional and null description and location', () => {
    expect(createEventSchema.safeParse({ ...valid, description: null }).success).toBe(true);
    expect(createEventSchema.safeParse({ ...valid, location: 'Dorpsplein' }).success).toBe(true);
  });

  it('trims the name and rejects an empty one', () => {
    expect(createEventSchema.parse({ ...valid, name: '  Quiz  ' }).name).toBe('Quiz');
    expect(createEventSchema.safeParse({ ...valid, name: '   ' }).success).toBe(false);
  });

  it('rejects anything that is not an ISO date-time', () => {
    expect(createEventSchema.safeParse({ ...valid, startsAt: 'tomorrow' }).success).toBe(false);
    expect(createEventSchema.safeParse({ ...valid, startsAt: '2026-12-12' }).success).toBe(false);
  });

  it('rejects an end before the start', () => {
    const result = createEventSchema.safeParse({ ...valid, endsAt: '2026-12-12T10:00:00+01:00' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['endsAt']);
  });

  it('drops fields the server owns', () => {
    const parsed = createEventSchema.parse({
      ...valid,
      id: '00000000-0000-4000-8000-000000000000',
      organizationId: 'someone-elses-org',
      status: 'archived',
    });
    expect(parsed).not.toHaveProperty('id');
    expect(parsed).not.toHaveProperty('organizationId');
    expect(parsed).not.toHaveProperty('status');
  });

  it('requires name, eventType, startsAt and endsAt', () => {
    expect(createEventSchema.safeParse({}).success).toBe(false);
    const { eventType: _, ...withoutType } = valid;
    expect(createEventSchema.safeParse(withoutType).success).toBe(false);
  });

  it('only accepts known event types', () => {
    expect(createEventSchema.safeParse({ ...valid, eventType: 'quiz' }).success).toBe(true);
    expect(createEventSchema.safeParse({ ...valid, eventType: 'wedding' }).success).toBe(false);
  });

  it('accepts an optional edition link, attendance and retrospective', () => {
    const parsed = createEventSchema.parse({
      ...valid,
      previousEditionId: '00000000-0000-4000-8000-000000000000',
      expectedAttendance: 800,
      actualAttendance: 0,
      retrospective: '  Meer glühwein  ',
    });
    expect(parsed).toMatchObject({ expectedAttendance: 800, retrospective: 'Meer glühwein' });
    expect(createEventSchema.safeParse({ ...valid, previousEditionId: null }).success).toBe(true);
  });

  it('rejects a malformed edition id and negative or fractional attendance', () => {
    expect(createEventSchema.safeParse({ ...valid, previousEditionId: 'x' }).success).toBe(false);
    expect(createEventSchema.safeParse({ ...valid, expectedAttendance: -1 }).success).toBe(false);
    expect(createEventSchema.safeParse({ ...valid, actualAttendance: 1.5 }).success).toBe(false);
  });
});

describe('updateEventSchema', () => {
  it('accepts a partial update', () => {
    expect(updateEventSchema.parse({ name: 'BBQ' })).toEqual({ name: 'BBQ' });
    expect(updateEventSchema.parse({ status: 'published' })).toEqual({ status: 'published' });
  });

  it('does not allow archiving through an update', () => {
    expect(updateEventSchema.safeParse({ status: 'archived' }).success).toBe(false);
  });

  it('rejects an end before the start when both are sent', () => {
    expect(
      updateEventSchema.safeParse({
        startsAt: '2026-12-12T18:00:00Z',
        endsAt: '2026-12-12T17:00:00Z',
      }).success,
    ).toBe(false);
  });
});

describe('addEventMemberSchema', () => {
  it('requires a non-empty userId and defaults nothing else', () => {
    expect(addEventMemberSchema.safeParse({}).success).toBe(false);
    expect(addEventMemberSchema.safeParse({ userId: '' }).success).toBe(false);
    expect(addEventMemberSchema.parse({ userId: 'u1' })).toEqual({ userId: 'u1' });
    expect(addEventMemberSchema.safeParse({ userId: 'u1', role: 'owner' }).success).toBe(false);
  });
});

describe('eventSchema', () => {
  it('describes the response with ISO strings', () => {
    const result = eventSchema.safeParse({
      id: '00000000-0000-4000-8000-000000000000',
      organizationId: 'org',
      name: 'x',
      eventType: 'market',
      description: null,
      location: null,
      startsAt: '2026-12-12T13:00:00.000Z',
      endsAt: '2026-12-12T22:00:00.000Z',
      status: 'draft',
      previousEditionId: null,
      expectedAttendance: null,
      actualAttendance: null,
      retrospective: null,
      setupStartsAt: null,
      teardownEndsAt: '2026-12-12T23:30:00.000Z',
      volunteerCommitment: 'shifts',
      shiftsPerVolunteer: 1,
      publicSlug: null,
      registrationOpen: false,
      registrationDeadline: null,
      schedulePublishedAt: null,
      createdAt: '2026-11-17T10:00:00.000Z',
      updatedAt: '2026-11-17T10:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });
});
