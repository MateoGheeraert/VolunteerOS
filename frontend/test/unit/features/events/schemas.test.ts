import { describe, expect, it } from 'vitest';
import {
  eventFormSchema as schema,
  toEventBody,
  toEventFormValues,
} from '@/features/events/schemas';
const valid = {
  name: 'Kerstmarkt 2026',
  description: '',
  location: 'Dorpsplein Merkem',
  date: '2026-12-19',
  startTime: '14:00',
  endTime: '23:00',
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

  it('rejects identical start and end times', () => {
    const result = schema.safeParse({ ...valid, endTime: '14:00' });
    expect(result.error?.issues[0]?.path).toEqual(['endTime']);
  });

  it('rejects malformed times', () => {
    expect(schema.safeParse({ ...valid, startTime: '25:00' }).success).toBe(false);
  });
});

describe('toEventBody', () => {
  it('converts Brussels times to UTC', () => {
    expect(toEventBody(valid)).toMatchObject({
      startsAt: '2026-12-19T13:00:00.000Z',
      endsAt: '2026-12-19T22:00:00.000Z',
      description: null,
    });
  });

  it('moves an end time before the start to the next day', () => {
    const body = toEventBody({ ...valid, startTime: '20:00', endTime: '02:00' });
    expect(body.endsAt).toBe('2026-12-20T01:00:00.000Z');
  });

  it('handles the next day across a month end', () => {
    const body = toEventBody({
      ...valid,
      date: '2026-12-31',
      startTime: '21:00',
      endTime: '03:00',
    });
    expect(body.endsAt).toBe('2027-01-01T02:00:00.000Z');
  });

  it('round-trips through toEventFormValues', () => {
    const overnight = { ...valid, startTime: '20:00', endTime: '02:00' };
    expect(toEventFormValues(toEventBody(overnight))).toEqual(overnight);
  });
});
