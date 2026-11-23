import type { TaskSuggestionContextInput } from '../task-suggestions/task-suggestions.context.js';
import type { Plan } from '../task-suggestions/task-suggestions.plan.js';

/**
 * Live evaluation cases for task suggestions. Each case is an event as the context builder sees
 * it, plus checks on the planned result (after the server's rules). Checks are code, not an LLM
 * judge: they test what must hold, not taste. Add a case for every bug a pilot organizer reports.
 */
export interface EvalCase {
  name: string;
  input: TaskSuggestionContextInput;
  checks: { name: string; pass: (plan: Plan) => boolean }[];
}

const ids = (prefix: string, n: number) =>
  `${prefix}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const base = (overrides: Partial<TaskSuggestionContextInput>): TaskSuggestionContextInput => ({
  language: 'nl-BE',
  today: '2026-11-19',
  event: {
    id: ids('e', 1),
    name: 'Evenement',
    eventType: 'other',
    description: null,
    location: null,
    startDate: '2027-02-20',
    endDate: '2027-02-20',
    expectedAttendance: null,
  },
  previousEdition: null,
  currentTasks: [],
  memories: [],
  answeredQuestions: [],
  earlierSuggestions: [],
  ...overrides,
});

const titles = (plan: Plan) =>
  plan.suggestions.filter((s) => s.kind === 'task_suggestion').map((s) => s.title.toLowerCase());
const anyTitle = (plan: Plan, pattern: RegExp) => titles(plan).some((title) => pattern.test(title));
const questions = (plan: Plan) => plan.suggestions.filter((s) => s.kind === 'question');
const unbacked = (plan: Plan) => plan.dropped.filter((d) => d.reason === 'unbacked').length;

/** Every case: the model only cites records it was given, and stays within limits. */
const always: EvalCase['checks'] = [
  { name: 'cites only real records', pass: (plan) => unbacked(plan) === 0 },
  { name: 'at most 10 tasks', pass: (plan) => titles(plan).length <= 10 },
  { name: 'at most 2 questions', pass: (plan) => questions(plan).length <= 2 },
];

export const TASK_SUGGESTION_CASES: EvalCase[] = [
  {
    name: 'Student party, first edition',
    input: base({
      event: {
        ...base({}).event,
        name: 'Fuif Chiro Merkem',
        eventType: 'party',
        description: 'Jaarlijkse fuif in de sporthal voor jongeren van 16 tot 25, met dj en bar.',
        location: 'Sporthal Merkem',
        expectedAttendance: 600,
      },
    }),
    checks: [
      ...always,
      { name: 'suggests tasks', pass: (plan) => titles(plan).length >= 3 },
      {
        name: 'something about the bar or drinks',
        pass: (plan) => anyTitle(plan, /bar|drank|tap|bier/),
      },
      {
        name: 'something about safety or security',
        pass: (plan) => anyTitle(plan, /veilig|security|ehbo|nadar|bewaking|vergunning/),
      },
    ],
  },
  {
    name: 'Christmas market, previous edition had a tent',
    input: base({
      event: {
        ...base({}).event,
        name: 'Kerstmarkt 2026',
        eventType: 'market',
        description: 'Kerstmarkt op het dorpsplein met 20 standen en glühwein.',
        startDate: '2026-12-12',
        endDate: '2026-12-12',
      },
      previousEdition: {
        id: ids('e', 2),
        name: 'Kerstmarkt 2025',
        startDate: '2025-12-13',
        actualAttendance: 750,
        retrospective: 'Te weinig verlichting aan de ingang.',
        tasks: [
          {
            id: ids('a', 1),
            title: 'Tent huren',
            description: null,
            priority: 'high',
            status: 'done',
            dueDate: '2025-11-15',
          },
          {
            id: ids('a', 2),
            title: 'Standhouders contacteren',
            description: null,
            priority: 'medium',
            status: 'done',
            dueDate: '2025-10-15',
          },
          {
            id: ids('a', 3),
            title: 'Glühwein bestellen',
            description: 'Bij de Spar',
            priority: 'medium',
            status: 'done',
            dueDate: '2025-12-01',
          },
        ],
      },
      currentTasks: [{ id: ids('b', 1), title: 'Standhouders mailen' }],
    }),
    checks: [
      ...always,
      { name: 'brings back the tent', pass: (plan) => anyTitle(plan, /tent/) },
      { name: 'brings back the glühwein', pass: (plan) => anyTitle(plan, /glühwein|gluhwein/) },
      {
        name: 'does not repeat contacting stallholders (already planned)',
        pass: (plan) => !anyTitle(plan, /standhouder/),
      },
      {
        name: 'acts on the lesson about lighting',
        pass: (plan) => anyTitle(plan, /verlicht|licht/),
      },
    ],
  },
  {
    name: 'Almost nothing known',
    input: base({ event: { ...base({}).event, name: 'Activiteit voorjaar', eventType: 'other' } }),
    checks: [
      ...always,
      { name: 'asks at least one question', pass: (plan) => questions(plan).length >= 1 },
    ],
  },
];
