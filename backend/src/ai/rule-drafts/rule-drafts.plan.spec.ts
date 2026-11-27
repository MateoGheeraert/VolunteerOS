import { describe, expect, it } from 'vitest';
import { buildNotesContext, buildRuleTextContext } from './rule-drafts.context.js';
import {
  matchNames,
  planNoteRules,
  planRuleText,
  resolvePerson,
  ruleKey,
} from './rule-drafts.plan.js';
import type { NotesOutput, RuleTextOutput } from './rule-drafts.schema.js';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const volunteers = [
  { volunteerId: id(1), name: 'Jan Peeters' },
  { volunteerId: id(2), name: 'Jan De Wit' },
  { volunteerId: id(3), name: 'Pieter Janssens' },
  { volunteerId: id(4), name: 'Zoë Claes' },
];
const base = {
  language: 'nl-BE',
  event: { name: 'Kerstmarkt' },
  teams: [{ name: 'Bar' }, { name: 'Kassa' }],
  volunteers,
};

const empty = { other: null, otherRefs: [], team: null, maxShifts: null, time: null, quote: '…' };
type TextRule = RuleTextOutput['rules'][number];
const textRule = (rule: Partial<TextRule> & Pick<TextRule, 'kind' | 'person'>): TextRule => ({
  personRefs: [],
  scope: 'organization',
  ...empty,
  ...rule,
});

describe('matchNames', () => {
  it('matches every written word, ignoring case and accents', () => {
    expect(matchNames('jan', volunteers).map((p) => p.name)).toEqual(['Jan Peeters', 'Jan De Wit']);
    expect(matchNames('Zoe', volunteers).map((p) => p.name)).toEqual(['Zoë Claes']);
    expect(matchNames('Jan Peeters', volunteers).map((p) => p.name)).toEqual(['Jan Peeters']);
    expect(matchNames('Piet', volunteers)).toEqual([]);
  });
});

describe('resolvePerson', () => {
  const people = buildRuleTextContext({ ...base, text: '' }).people;

  it('resolves a clear name', () => {
    expect(resolvePerson('Pieter', ['V3'], people)).toMatchObject({ volunteerId: id(3) });
  });

  it('asks when a name fits several people, even when the model picked one', () => {
    const pick = resolvePerson('Jan', ['V1'], people);
    expect(pick).toEqual({
      name: 'Jan',
      volunteerId: null,
      candidates: [
        { volunteerId: id(2), name: 'Jan De Wit' },
        { volunteerId: id(1), name: 'Jan Peeters' },
      ],
    });
  });

  it("trusts the model's pick for a nickname no name fits", () => {
    expect(resolvePerson('Piet', ['V3'], people)).toMatchObject({ volunteerId: id(3) });
  });

  it('returns null for someone not on the event', () => {
    expect(resolvePerson('Karel', [], people)).toBeNull();
    expect(resolvePerson('Karel', ['V99'], people)).toBeNull();
  });
});

describe('planRuleText', () => {
  const context = buildRuleTextContext({ ...base, text: 'x' });

  it('turns the text into chips with the right fields', () => {
    const { rules, unknownNames } = planRuleText(
      {
        rules: [
          textRule({ kind: 'not_team', person: 'Zoë', personRefs: ['V4'], team: 'T2' }),
          textRule({
            kind: 'not_before',
            person: 'Pieter',
            personRefs: ['V3'],
            time: '18u',
            scope: 'event',
          }),
          textRule({
            kind: 'never_together',
            person: 'Pieter',
            personRefs: ['V3'],
            other: 'Zoë',
            otherRefs: ['V4'],
          }),
        ],
      },
      context,
    );
    expect(unknownNames).toEqual([]);
    expect(rules).toMatchObject([
      { kind: 'not_team', teamName: 'Kassa', person: { volunteerId: id(4) } },
      { kind: 'not_before', time: '18:00', scope: 'event' },
      { kind: 'never_together', other: { volunteerId: id(4) } },
    ]);
  });

  it('keeps an ambiguous name as a chip that asks, and reports unknown names', () => {
    const { rules, unknownNames } = planRuleText(
      {
        rules: [
          textRule({ kind: 'max_shifts', person: 'Jan', personRefs: ['V1', 'V2'], maxShifts: 1 }),
          textRule({ kind: 'max_shifts', person: 'Karel', maxShifts: 1 }),
          textRule({ kind: 'prefer_together', person: 'Zoë', personRefs: ['V4'], other: 'Karel' }),
        ],
      },
      context,
    );
    expect(rules).toHaveLength(1);
    expect(rules[0]!.person.volunteerId).toBeNull();
    expect(rules[0]!.person.candidates).toHaveLength(2);
    expect(unknownNames).toEqual(['Karel']);
  });

  it('drops incomplete rules, invented teams and doubles', () => {
    const { rules } = planRuleText(
      {
        rules: [
          textRule({ kind: 'not_team', person: 'Zoë', personRefs: ['V4'] }),
          textRule({ kind: 'not_team', person: 'Zoë', personRefs: ['V4'], team: 'T9' }),
          textRule({ kind: 'not_after', person: 'Zoë', personRefs: ['V4'], time: 'laat' }),
          textRule({ kind: 'max_shifts', person: 'Zoë', personRefs: ['V4'], maxShifts: 99 }),
          textRule({ kind: 'prefers_team', person: 'Zoë', personRefs: ['V4'], team: 'Afwas' }),
          textRule({ kind: 'prefers_team', person: 'Zoë', personRefs: ['V4'], team: 'afwas' }),
          textRule({
            kind: 'never_together',
            person: 'Zoë',
            personRefs: ['V4'],
            other: 'Zoë',
            otherRefs: ['V4'],
          }),
        ],
      },
      context,
    );
    expect(rules.map((r) => [r.kind, r.teamName])).toEqual([['prefers_team', 'Afwas']]);
  });
});

describe('planNoteRules', () => {
  const context = buildNotesContext({
    ...base,
    notes: [
      {
        applicationId: id(13),
        volunteerId: id(3),
        text: 'Ik kan pas na 18u, liefst samen met Jan.',
      },
      { applicationId: id(14), volunteerId: id(4), text: 'Liever niet aan de kassa.' },
    ],
  });
  const note = (
    rule: Partial<NotesOutput['rules'][number]> &
      Pick<NotesOutput['rules'][number], 'kind' | 'note'>,
  ) => ({
    ...empty,
    ...rule,
  });
  const state = { existingRuleKeys: new Set<string>(), decidedCards: new Map<string, string>() };

  it('makes a card about the author of each note, citing it, and applies resolved ones', () => {
    const plan = planNoteRules(
      {
        rules: [
          note({ note: 'N1', kind: 'not_before', time: '18:00' }),
          note({ note: 'N2', kind: 'not_team', team: 'T2' }),
        ],
      },
      context,
      state,
    );
    expect(plan.cards.map((c) => c.title)).toEqual([
      'Pieter Janssens: niet vóór 18:00',
      'Zoë Claes: niet in Kassa',
    ]);
    expect(plan.cards[0]).toMatchObject({
      payload: { applicationId: id(13), scope: 'event', person: { volunteerId: id(3) } },
      citations: [{ type: 'note', id: id(13) }],
    });
    expect(plan.solverRules).toEqual([
      { kind: 'not_before', volunteerId: id(3), time: '18:00' },
      { kind: 'not_team', volunteerId: id(4), teamName: 'Kassa' },
    ]);
  });

  it('asks about an ambiguous other person and does not apply that rule yet', () => {
    const plan = planNoteRules(
      { rules: [note({ note: 'N1', kind: 'prefer_together', other: 'Jan', otherRefs: ['V1'] })] },
      context,
      state,
    );
    expect(plan.cards[0]!.payload.other?.volunteerId).toBeNull();
    expect(plan.solverRules).toEqual([]);
  });

  it('skips unknown notes, known rules and rejected cards', () => {
    const known = ruleKey({
      kind: 'not_before',
      volunteerId: id(3),
      otherVolunteerId: null,
      teamName: null,
      maxShifts: null,
      time: '18:00',
    });
    const rejected = ruleKey({
      kind: 'not_team',
      volunteerId: id(4),
      otherVolunteerId: null,
      teamName: 'Kassa',
      maxShifts: null,
      time: null,
    });
    const plan = planNoteRules(
      {
        rules: [
          note({ note: 'N9', kind: 'max_shifts', maxShifts: 1 }),
          note({ note: 'N1', kind: 'not_before', time: '18:00' }),
          note({ note: 'N2', kind: 'not_team', team: 'T2' }),
        ],
      },
      context,
      { existingRuleKeys: new Set([known]), decidedCards: new Map([[rejected, 'rejected']]) },
    );
    expect(plan.cards).toEqual([]);
    expect(plan.solverRules).toEqual([]);
    expect(plan.dropped.map((d) => d.reason)).toEqual(['unbacked', 'known', 'rejected']);
  });
});

describe('ruleKey', () => {
  it('ignores the order of the two people and the case of the team', () => {
    const pair = (a: string, b: string) =>
      ruleKey({
        kind: 'never_together',
        volunteerId: a,
        otherVolunteerId: b,
        teamName: null,
        maxShifts: null,
        time: null,
      });
    expect(pair(id(1), id(2))).toBe(pair(id(2), id(1)));
    const team = (name: string) =>
      ruleKey({
        kind: 'not_team',
        volunteerId: id(1),
        otherVolunteerId: null,
        teamName: name,
        maxShifts: null,
        time: null,
      });
    expect(team('Bar')).toBe(team('bar'));
  });
});
