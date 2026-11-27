import type {
  NotesContextInput,
  RuleTextContextInput,
} from '../rule-drafts/rule-drafts.context.js';
import type { NotesPlan, RuleTextPlan } from '../rule-drafts/rule-drafts.plan.js';
import type { ShiftSuggestionContextInput } from '../shift-suggestions/shift-suggestions.context.js';
import type { ShiftPlan } from '../shift-suggestions/shift-suggestions.plan.js';

/**
 * Live evaluation cases for Mila on the planning page (docs/info.md §7.7.1): teams and shifts
 * with and without history, and rules read from the organizer's text and the volunteers' notes.
 * Checks are code on the planned result, like task-suggestions.fixtures.ts.
 */

interface Check<Plan> {
  name: string;
  pass: (plan: Plan) => boolean;
}

export interface ShiftEvalCase {
  name: string;
  input: ShiftSuggestionContextInput;
  checks: Check<ShiftPlan>[];
}

export interface RuleTextEvalCase {
  name: string;
  input: RuleTextContextInput;
  checks: Check<RuleTextPlan>[];
}

export interface NotesEvalCase {
  name: string;
  input: NotesContextInput;
  checks: Check<NotesPlan>[];
}

const id = (prefix: string, n: number) =>
  `${prefix}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const local = (day: string, time: string) => new Date(`${day}T${time}:00+01:00`);

const teamCards = (plan: ShiftPlan) => plan.cards.filter((c) => c.kind === 'team_suggestion');
const teamNamed = (plan: ShiftPlan, pattern: RegExp) =>
  teamCards(plan).find((c) => pattern.test(c.title.toLowerCase()));
const shiftsOf = (card: ShiftPlan['cards'][number] | undefined) =>
  card && 'shifts' in card.payload ? card.payload.shifts : [];
const noOverlapWithinTeams = (plan: ShiftPlan) =>
  teamCards(plan).every((card) =>
    shiftsOf(card).every((a, i) =>
      shiftsOf(card).every((b, j) => i === j || a.endsAt <= b.startsAt || b.endsAt <= a.startsAt),
    ),
  );
const unbacked = (plan: ShiftPlan) => plan.dropped.filter((d) => d.reason === 'unbacked').length;

const shift = (
  n: number,
  day: string,
  from: string,
  to: string,
  capacity: number,
  assigned = capacity,
) => ({
  id: id('5', n),
  startsAt: local(day, from),
  endsAt: local(day, to),
  capacity,
  assigned,
});

export const SHIFT_SUGGESTION_CASES: ShiftEvalCase[] = [
  {
    name: 'Christmas market with last year’s planning',
    input: {
      language: 'nl-BE',
      today: '2026-11-25',
      event: {
        id: id('e', 1),
        name: 'Kerstmarkt 2026',
        eventType: 'market',
        startsAt: local('2026-12-19', '14:00'),
        endsAt: local('2026-12-19', '23:00'),
        windowStartsAt: local('2026-12-18', '18:00'),
        windowEndsAt: local('2026-12-20', '00:00'),
        expectedAttendance: 800,
        volunteerCount: 16,
        shiftsPerVolunteer: 1,
      },
      previousEdition: {
        id: id('e', 2),
        name: 'Kerstmarkt 2025',
        startsAt: local('2025-12-20', '14:00'),
        expectedAttendance: 600,
        actualAttendance: 720,
        retrospective:
          'Glühwein was om 19u op. Opbouw startte te laat, volgend jaar de tenten de avond ervoor zetten.',
        teams: [
          {
            id: id('a', 1),
            name: 'Bar',
            description: null,
            defaultMeetingPoint: 'Achter de toog',
            shifts: [
              shift(1, '2025-12-20', '14:00', '18:00', 3),
              shift(2, '2025-12-20', '18:00', '23:00', 4),
            ],
          },
          {
            id: id('a', 2),
            name: 'Kassa',
            description: null,
            defaultMeetingPoint: null,
            shifts: [
              shift(3, '2025-12-20', '14:00', '18:00', 2),
              shift(4, '2025-12-20', '18:00', '23:00', 2),
            ],
          },
          {
            id: id('a', 3),
            name: 'Opbouw',
            description: null,
            defaultMeetingPoint: 'Kerkplein',
            shifts: [shift(5, '2025-12-20', '09:00', '13:00', 5)],
          },
          {
            id: id('a', 4),
            name: 'Afbraak',
            description: 'Kraampjes afbreken en het plein proper achterlaten.',
            defaultMeetingPoint: 'Kerkplein',
            shifts: [shift(6, '2025-12-20', '22:00', '23:30', 5)],
          },
        ],
      },
      currentTeams: [
        {
          id: id('b', 1),
          name: 'Bar',
          description: null,
          defaultMeetingPoint: 'Achter de toog',
          shifts: [
            shift(11, '2026-12-19', '14:00', '18:00', 4, 2),
            shift(12, '2026-12-19', '18:00', '23:00', 4, 2),
          ],
        },
        {
          id: id('b', 2),
          name: 'Kassa',
          description: null,
          defaultMeetingPoint: null,
          shifts: [
            shift(13, '2026-12-19', '14:00', '18:00', 2, 1),
            shift(14, '2026-12-19', '18:00', '23:00', 2, 1),
          ],
        },
        {
          id: id('b', 3),
          name: 'Opbouw',
          description: null,
          defaultMeetingPoint: 'Kerkplein',
          shifts: [shift(15, '2026-12-18', '18:00', '21:00', 6, 3)],
        },
      ],
      earlierSuggestions: [],
    },
    checks: [
      { name: 'cites only real records', pass: (plan) => unbacked(plan) === 0 },
      {
        name: 'suggests last year’s teardown team',
        pass: (plan) => teamNamed(plan, /afbraak|opruim/) !== undefined,
      },
      {
        name: 'the teardown team cites last year',
        pass: (plan) =>
          teamNamed(plan, /afbraak|opruim/)?.citations.some(
            (c) => c.type === 'team' || c.type === 'shift',
          ) ?? false,
      },
      {
        name: 'never suggests an existing team',
        pass: (plan) => !teamCards(plan).some((c) => /^(bar|kassa|opbouw)$/i.test(c.title)),
      },
      { name: 'no overlapping shifts within a team', pass: noOverlapWithinTeams },
      { name: 'at most 10 cards', pass: (plan) => plan.cards.length <= 10 },
    ],
  },
  {
    name: 'Spaghetti dinner without history (catalogue)',
    input: {
      language: 'nl-BE',
      today: '2026-11-25',
      event: {
        id: id('e', 3),
        name: 'Spaghettiavond 2027',
        eventType: 'meal',
        startsAt: local('2027-02-08', '18:00'),
        endsAt: local('2027-02-08', '23:00'),
        windowStartsAt: local('2027-02-08', '14:00'),
        windowEndsAt: local('2027-02-09', '00:00'),
        expectedAttendance: 250,
        volunteerCount: 0,
        shiftsPerVolunteer: 1,
      },
      previousEdition: null,
      currentTeams: [],
      earlierSuggestions: [],
    },
    checks: [
      { name: 'cites only real records', pass: (plan) => unbacked(plan) === 0 },
      { name: 'suggests at least 3 teams', pass: (plan) => teamCards(plan).length >= 3 },
      { name: 'a kitchen team', pass: (plan) => teamNamed(plan, /keuken|kok/) !== undefined },
      {
        name: 'a service team',
        pass: (plan) => teamNamed(plan, /bedien|zaal|ober|serv/) !== undefined,
      },
      {
        name: 'every team cites the catalogue or the event',
        pass: (plan) =>
          teamCards(plan).every((c) =>
            c.citations.some((x) => x.type === 'catalogue' || x.type === 'event'),
          ),
      },
      {
        name: 'the kitchen is sized for 250 guests (at least 3)',
        pass: (plan) => shiftsOf(teamNamed(plan, /keuken|kok/)).some((s) => s.capacity >= 3),
      },
      { name: 'no overlapping shifts within a team', pass: noOverlapWithinTeams },
    ],
  },
  {
    name: 'Spaghetti dinner: the organizer asks for dishes and bar shifts',
    input: {
      language: 'nl-BE',
      today: '2026-11-25',
      event: {
        id: id('e', 4),
        name: 'Spaghettiavond 2027',
        eventType: 'meal',
        startsAt: local('2027-02-08', '18:00'),
        endsAt: local('2027-02-08', '23:00'),
        windowStartsAt: local('2027-02-08', '14:00'),
        windowEndsAt: local('2027-02-09', '00:00'),
        expectedAttendance: 250,
        volunteerCount: 0,
        shiftsPerVolunteer: 1,
      },
      previousEdition: null,
      currentTeams: [
        {
          id: id('b', 4),
          name: 'Bar',
          description: null,
          defaultMeetingPoint: null,
          shifts: [shift(21, '2027-02-08', '18:00', '20:30', 2, 0)],
        },
      ],
      earlierSuggestions: [],
      instruction: 'Twee shiften voor de afwas en twee shiften achter de bar.',
    },
    checks: [
      { name: 'cites only real records', pass: (plan) => unbacked(plan) === 0 },
      {
        name: 'a dishes team with exactly two shifts',
        pass: (plan) => shiftsOf(teamNamed(plan, /afwas/)).length === 2,
      },
      {
        name: 'the dishes team cites the request',
        pass: (plan) =>
          teamNamed(plan, /afwas/)?.citations.some((c) => c.type === 'request') ?? false,
      },
      {
        name: 'the existing bar gets an extra shift, not a new team',
        pass: (plan) =>
          !teamNamed(plan, /^bar$/) &&
          plan.cards.some(
            (c) =>
              c.kind === 'shift_change' &&
              'type' in c.payload &&
              c.payload.type === 'add_shift' &&
              c.payload.teamName === 'Bar',
          ),
      },
      {
        name: 'nothing beyond what was asked',
        pass: (plan) => teamCards(plan).every((c) => /afwas/i.test(c.title)),
      },
      { name: 'no overlapping shifts within a team', pass: noOverlapWithinTeams },
    ],
  },
];

const volunteers = [
  { volunteerId: id('c', 1), name: 'Jan Peeters' },
  { volunteerId: id('c', 2), name: 'Jan De Wit' },
  { volunteerId: id('c', 3), name: 'Zoë Claes' },
  { volunteerId: id('c', 4), name: 'Pieter Janssens' },
  { volunteerId: id('c', 5), name: 'Victor Lambert' },
  { volunteerId: id('c', 6), name: 'Nora De Smet' },
  { volunteerId: id('c', 7), name: 'Arthur Maes' },
  { volunteerId: id('c', 8), name: 'Jules Willems' },
  { volunteerId: id('c', 9), name: 'Sara Peeters' },
];
const base = {
  language: 'nl-BE',
  event: { name: 'Kerstmarkt 2026' },
  teams: [{ name: 'Bar' }, { name: 'Kassa' }, { name: 'Opbouw' }],
  volunteers,
};
const who = (name: string) => volunteers.find((v) => v.name === name)!.volunteerId;
const textRule = (plan: RuleTextPlan, kind: string) => plan.rules.find((r) => r.kind === kind);

export const RULE_TEXT_CASES: RuleTextEvalCase[] = [
  {
    name: 'Rules from text, with an ambiguous Jan',
    input: {
      ...base,
      text: 'Jan mag niet aan de kassa. Zoë en Pieter staan liefst samen. Pieter kan maar 1 shift doen.',
    },
    checks: [
      {
        name: 'Jan: not at the cash desk, asking which Jan',
        pass: (plan) => {
          const rule = textRule(plan, 'not_team');
          return (
            rule?.teamName === 'Kassa' &&
            rule.person.volunteerId === null &&
            rule.person.candidates.length === 2
          );
        },
      },
      {
        name: 'Zoë and Pieter preferably together',
        pass: (plan) => {
          const rule = textRule(plan, 'prefer_together');
          const people = new Set([rule?.person.volunteerId, rule?.other?.volunteerId]);
          return people.has(who('Zoë Claes')) && people.has(who('Pieter Janssens'));
        },
      },
      {
        name: 'Pieter: at most 1 shift',
        pass: (plan) => {
          const rule = textRule(plan, 'max_shifts');
          return rule?.maxShifts === 1 && rule.person.volunteerId === who('Pieter Janssens');
        },
      },
      { name: 'exactly 3 rules', pass: (plan) => plan.rules.length === 3 },
    ],
  },
  {
    name: 'Times, and a name nobody has',
    input: {
      ...base,
      text: 'Karel kan pas vanaf 19u. Zoë moet om 22u weg, ze werkt de dag erna vroeg.',
    },
    checks: [
      {
        name: 'reports Karel as unknown',
        pass: (plan) => plan.unknownNames.some((n) => /karel/i.test(n)),
      },
      {
        name: 'Zoë: not after 22:00',
        pass: (plan) => {
          const rule = textRule(plan, 'not_after');
          return rule?.time === '22:00' && rule.person.volunteerId === who('Zoë Claes');
        },
      },
      { name: 'no rule for Karel', pass: (plan) => plan.rules.length === 1 },
    ],
  },
];

export const NOTES_CASES: NotesEvalCase[] = [
  {
    name: 'Rules from the volunteers’ notes',
    input: {
      ...base,
      notes: [
        {
          applicationId: id('d', 1),
          volunteerId: who('Victor Lambert'),
          text: 'Ik werk overdag, ik kan pas vanaf 17u.',
        },
        {
          applicationId: id('d', 2),
          volunteerId: who('Nora De Smet'),
          text: 'Graag samen met Arthur, we rijden samen naar het kerkplein.',
        },
        {
          applicationId: id('d', 3),
          volunteerId: who('Jules Willems'),
          text: 'Eerste keer dat ik help, ik ben benieuwd!',
        },
        {
          applicationId: id('d', 4),
          volunteerId: who('Sara Peeters'),
          text: 'Zet me aub niet aan de kassa, ik ben slecht met wisselgeld.',
        },
      ],
    },
    checks: [
      {
        name: 'Victor: not before 17:00',
        pass: (plan) =>
          plan.solverRules.some(
            (r) =>
              r.kind === 'not_before' &&
              r.volunteerId === who('Victor Lambert') &&
              r.time === '17:00',
          ),
      },
      {
        name: 'Nora: preferably with Arthur',
        pass: (plan) =>
          plan.solverRules.some(
            (r) =>
              r.kind === 'prefer_together' &&
              r.volunteerId === who('Nora De Smet') &&
              r.otherVolunteerId === who('Arthur Maes'),
          ),
      },
      {
        name: 'Sara: not at the cash desk',
        pass: (plan) =>
          plan.solverRules.some(
            (r) =>
              (r.kind === 'not_team' || r.kind === 'prefers_team') &&
              r.volunteerId === who('Sara Peeters') &&
              r.kind === 'not_team' &&
              r.teamName === 'Kassa',
          ),
      },
      {
        name: 'nothing from Jules’ note',
        pass: (plan) =>
          !plan.cards.some((c) => c.payload.person.volunteerId === who('Jules Willems')),
      },
      {
        name: 'every card cites its note',
        pass: (plan) => plan.cards.every((c) => c.citations[0]?.type === 'note'),
      },
      {
        name: 'no unbacked rules',
        pass: (plan) => !plan.dropped.some((d) => d.reason === 'unbacked'),
      },
    ],
  },
];
