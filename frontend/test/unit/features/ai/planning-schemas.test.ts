import { describe, expect, it } from 'vitest';
import { draftToRuleBody, toRuleBody } from '@/features/ai/planning/schemas';

const a = '00000000-0000-4000-8000-000000000001';
const b = '00000000-0000-4000-8000-000000000002';

describe('toRuleBody', () => {
  it('keeps only the field the kind uses', () => {
    expect(
      toRuleBody({
        kind: 'not_team',
        scope: 'event',
        volunteerId: a,
        teamName: ' Bar ',
        time: '18:00',
      }),
    ).toEqual({ kind: 'not_team', scope: 'event', volunteerId: a, teamName: 'Bar' });
    expect(
      toRuleBody({
        kind: 'not_before',
        scope: 'organization',
        volunteerId: a,
        time: '18:00',
        teamName: 'Bar',
      }),
    ).toEqual({ kind: 'not_before', scope: 'organization', volunteerId: a, time: '18:00' });
    expect(
      toRuleBody({ kind: 'max_shifts', scope: 'event', volunteerId: a, maxShifts: 0 }),
    ).toMatchObject({
      maxShifts: 0,
    });
  });

  it('is null while the rule is incomplete', () => {
    expect(
      toRuleBody({ kind: 'not_team', scope: 'event', volunteerId: null, teamName: 'Bar' }),
    ).toBeNull();
    expect(
      toRuleBody({ kind: 'not_team', scope: 'event', volunteerId: a, teamName: '  ' }),
    ).toBeNull();
    expect(
      toRuleBody({ kind: 'never_together', scope: 'event', volunteerId: a, otherVolunteerId: a }),
    ).toBeNull();
    expect(
      toRuleBody({ kind: 'not_after', scope: 'event', volunteerId: a, time: '25:00' }),
    ).toBeNull();
  });
});

describe('draftToRuleBody', () => {
  it('uses the person the organizer picked for an ambiguous name', () => {
    expect(
      draftToRuleBody({
        kind: 'prefer_together',
        scope: 'organization',
        teamName: null,
        maxShifts: null,
        time: null,
        personId: a,
        otherId: b,
      }),
    ).toEqual({
      kind: 'prefer_together',
      scope: 'organization',
      volunteerId: a,
      otherVolunteerId: b,
    });
    expect(
      draftToRuleBody({
        kind: 'prefer_together',
        scope: 'organization',
        teamName: null,
        maxShifts: null,
        time: null,
        personId: a,
        otherId: null,
      }),
    ).toBeNull();
  });
});
