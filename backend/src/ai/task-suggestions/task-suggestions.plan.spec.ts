import { describe, expect, it } from 'vitest';
import type { Citation } from '../ai.types.js';
import {
  planTaskSuggestions,
  staleSuggestionKeys,
  type PlanState,
} from './task-suggestions.plan.js';
import type { TaskSuggestionOutput } from './task-suggestions.schema.js';

const refs = new Map<string, Citation>([
  ['E', { type: 'event', id: 'event-1', label: 'Kerstmarkt 2026' }],
  ['P1', { type: 'task', id: 'task-old-1', label: 'Tent huren' }],
]);

const state = (overrides: Partial<PlanState> = {}): PlanState => ({
  eventStartDate: '2026-12-12',
  today: '2026-11-19',
  existingTaskTitles: [],
  emptyEventFields: ['description', 'location', 'expectedAttendance'],
  openQuestionCount: 0,
  existingMemoryContents: [],
  ...overrides,
});

const output = (overrides: Partial<TaskSuggestionOutput> = {}): TaskSuggestionOutput => ({
  tasks: [],
  questions: [],
  eventUpdates: [],
  memories: [],
  ...overrides,
});

const task = (overrides: Partial<TaskSuggestionOutput['tasks'][number]> = {}) => ({
  title: 'Tent huren',
  description: 'Bij dezelfde verhuurder als vorig jaar',
  priority: 'high' as const,
  daysBeforeEvent: 21,
  reason: 'Vorig jaar was er een tent nodig.',
  cites: ['P1'],
  ...overrides,
});

describe('planTaskSuggestions: tasks', () => {
  it('turns a backed task into a pending suggestion with its citations', () => {
    const plan = planTaskSuggestions(output({ tasks: [task()] }), refs, state());
    expect(plan.suggestions).toEqual([
      {
        kind: 'task_suggestion',
        dedupKey: 'task:tent huren',
        title: 'Tent huren',
        explanation: 'Vorig jaar was er een tent nodig.',
        payload: {
          title: 'Tent huren',
          description: 'Bij dezelfde verhuurder als vorig jaar',
          priority: 'high',
          dueDate: '2026-11-21',
        },
        citations: [{ type: 'task', id: 'task-old-1', label: 'Tent huren' }],
      },
    ]);
  });

  it('drops a task that cites nothing or cites a reference that was never sent', () => {
    const plan = planTaskSuggestions(
      output({
        tasks: [
          task({ title: 'Geen bron', cites: [] }),
          task({ title: 'Verzonnen', cites: ['P9'] }),
        ],
      }),
      refs,
      state(),
    );
    expect(plan.suggestions).toEqual([]);
    expect(plan.dropped).toEqual([
      { kind: 'task_suggestion', title: 'Geen bron', reason: 'unbacked' },
      { kind: 'task_suggestion', title: 'Verzonnen', reason: 'unbacked' },
    ]);
  });

  it('skips a task the event already has, ignoring case and spacing', () => {
    const plan = planTaskSuggestions(
      output({ tasks: [task({ title: '  tent   HUREN ' })] }),
      refs,
      state({ existingTaskTitles: ['Tent huren'] }),
    );
    expect(plan.suggestions).toEqual([]);
    expect(plan.dropped).toEqual([
      { kind: 'task_suggestion', title: '  tent   HUREN ', reason: 'exists' },
    ]);
  });

  it('keeps only the first of two tasks with the same title', () => {
    const plan = planTaskSuggestions(
      output({ tasks: [task(), task({ priority: 'low' })] }),
      refs,
      state(),
    );
    expect(plan.suggestions).toHaveLength(1);
    expect(plan.suggestions[0]!.payload).toMatchObject({ priority: 'high' });
    expect(plan.dropped).toEqual([
      { kind: 'task_suggestion', title: 'Tent huren', reason: 'duplicate' },
    ]);
  });

  it('leaves the due date empty when it would already be past, or when none was given', () => {
    const plan = planTaskSuggestions(
      output({
        tasks: [
          task({ title: 'Te laat', daysBeforeEvent: 60 }),
          task({ title: 'Geen datum', daysBeforeEvent: null }),
          task({ title: 'Vandaag', daysBeforeEvent: 23 }),
        ],
      }),
      refs,
      state(),
    );
    expect(plan.suggestions.map((s) => (s.payload as { dueDate: string | null }).dueDate)).toEqual([
      null,
      null,
      '2026-11-19',
    ]);
  });
});

const question = (overrides: Partial<TaskSuggestionOutput['questions'][number]> = {}) => ({
  question: 'Hoeveel bezoekers verwacht je?',
  options: ['< 200', '200–1000', '> 1000'],
  eventField: 'expectedAttendance' as const,
  reason: 'Het aantal bezoekers bepaalt hoeveel kassa’s je nodig hebt.',
  ...overrides,
});

describe('planTaskSuggestions: questions', () => {
  it('asks a question, keyed on the field it fills in', () => {
    const plan = planTaskSuggestions(output({ questions: [question()] }), refs, state());
    expect(plan.suggestions).toEqual([
      {
        kind: 'question',
        dedupKey: 'question:field:expectedAttendance',
        title: 'Hoeveel bezoekers verwacht je?',
        explanation: 'Het aantal bezoekers bepaalt hoeveel kassa’s je nodig hebt.',
        payload: { options: ['< 200', '200–1000', '> 1000'], eventField: 'expectedAttendance' },
        citations: [],
      },
    ]);
  });

  it('keys a question without a field on its text', () => {
    const plan = planTaskSuggestions(
      output({ questions: [question({ question: ' Buiten of BINNEN? ', eventField: null })] }),
      refs,
      state(),
    );
    expect(plan.suggestions[0]).toMatchObject({ dedupKey: 'question:buiten of binnen?' });
  });

  it('does not ask about a field that is already filled in', () => {
    const plan = planTaskSuggestions(
      output({ questions: [question()] }),
      refs,
      state({ emptyEventFields: ['description'] }),
    );
    expect(plan.suggestions).toEqual([]);
    expect(plan.dropped).toEqual([
      { kind: 'question', title: 'Hoeveel bezoekers verwacht je?', reason: 'field_filled' },
    ]);
  });

  it('keeps at most 3 questions open per event', () => {
    const plan = planTaskSuggestions(
      output({
        questions: [
          question({ question: 'Een?', eventField: null }),
          question({ question: 'Twee?', eventField: null }),
        ],
      }),
      refs,
      state({ openQuestionCount: 2 }),
    );
    expect(plan.suggestions.map((s) => s.title)).toEqual(['Een?']);
    expect(plan.dropped).toEqual([{ kind: 'question', title: 'Twee?', reason: 'too_many' }]);
  });

  it('drops answer options beyond 6', () => {
    const plan = planTaskSuggestions(
      output({ questions: [question({ options: ['1', '2', '3', '4', '5', '6', '7'] })] }),
      refs,
      state(),
    );
    expect((plan.suggestions[0]!.payload as { options: string[] }).options).toHaveLength(6);
  });
});

const update = (overrides: Partial<TaskSuggestionOutput['eventUpdates'][number]> = {}) => ({
  field: 'location' as const,
  value: 'Marktplein Merkem',
  reason: 'Vorig jaar stond de markt op het marktplein.',
  cites: ['P1'],
  ...overrides,
});

describe('planTaskSuggestions: event updates', () => {
  it('proposes a value for an empty field', () => {
    const plan = planTaskSuggestions(output({ eventUpdates: [update()] }), refs, state());
    expect(plan.suggestions).toEqual([
      {
        kind: 'update_event',
        dedupKey: 'field:location',
        title: 'Marktplein Merkem',
        explanation: 'Vorig jaar stond de markt op het marktplein.',
        payload: { field: 'location', value: 'Marktplein Merkem' },
        citations: [{ type: 'task', id: 'task-old-1', label: 'Tent huren' }],
      },
    ]);
  });

  it('never overwrites a field that already has a value', () => {
    const plan = planTaskSuggestions(
      output({ eventUpdates: [update()] }),
      refs,
      state({ emptyEventFields: ['description'] }),
    );
    expect(plan.suggestions).toEqual([]);
    expect(plan.dropped).toEqual([
      { kind: 'update_event', title: 'Marktplein Merkem', reason: 'field_filled' },
    ]);
  });

  it('drops an uncited update', () => {
    const plan = planTaskSuggestions(
      output({ eventUpdates: [update({ cites: [] })] }),
      refs,
      state(),
    );
    expect(plan.dropped).toEqual([
      { kind: 'update_event', title: 'Marktplein Merkem', reason: 'unbacked' },
    ]);
  });

  it('only proposes a whole, non-negative number of visitors', () => {
    const plan = planTaskSuggestions(
      output({
        eventUpdates: [
          update({ field: 'expectedAttendance', value: 'ongeveer 800' }),
          update({ field: 'expectedAttendance', value: ' 800 ' }),
        ],
      }),
      refs,
      state(),
    );
    expect(plan.suggestions.map((s) => s.payload)).toEqual([
      { field: 'expectedAttendance', value: '800' },
    ]);
    expect(plan.dropped).toEqual([
      { kind: 'update_event', title: 'ongeveer 800', reason: 'invalid_value' },
    ]);
  });
});

const memory = (overrides: Partial<TaskSuggestionOutput['memories'][number]> = {}) => ({
  content: 'De tap komt altijd van de lokale brouwerij.',
  scope: 'organization' as const,
  confidence: 'medium' as const,
  cites: ['P1'],
  ...overrides,
});

describe('planTaskSuggestions: memories', () => {
  it('remembers a cited fact at its scope', () => {
    const plan = planTaskSuggestions(output({ memories: [memory()] }), refs, state());
    expect(plan.memories).toEqual([
      {
        content: 'De tap komt altijd van de lokale brouwerij.',
        scope: 'organization',
        confidence: 'medium',
        citations: [{ type: 'task', id: 'task-old-1', label: 'Tent huren' }],
      },
    ]);
  });

  it('skips uncited facts and facts it already knows', () => {
    const plan = planTaskSuggestions(
      output({
        memories: [
          memory({ content: 'Zonder bron', cites: [] }),
          memory({ content: ' de tap komt ALTIJD van de lokale brouwerij. ' }),
        ],
      }),
      refs,
      state({ existingMemoryContents: ['De tap komt altijd van de lokale brouwerij.'] }),
    );
    expect(plan.memories).toEqual([]);
    expect(plan.dropped).toEqual([
      { kind: 'memory', title: 'Zonder bron', reason: 'unbacked' },
      { kind: 'memory', title: ' de tap komt ALTIJD van de lokale brouwerij. ', reason: 'exists' },
    ]);
  });

  it('keeps at most 5 new memories per run', () => {
    const plan = planTaskSuggestions(
      output({ memories: [1, 2, 3, 4, 5, 6].map((n) => memory({ content: `Feit ${n}` })) }),
      refs,
      state(),
    );
    expect(plan.memories.map((m) => m.content)).toEqual([
      'Feit 1',
      'Feit 2',
      'Feit 3',
      'Feit 4',
      'Feit 5',
    ]);
    expect(plan.dropped).toEqual([{ kind: 'memory', title: 'Feit 6', reason: 'too_many' }]);
  });
});

describe('staleSuggestionKeys', () => {
  it('closes pending cards whose cause is gone', () => {
    const pending = [
      'task:tent huren', // created by hand since
      'task:tap reinigen', // still missing
      'field:location', // filled in since
      'question:field:expectedAttendance', // filled in since
      'question:field:description', // still empty
      'question:buiten of binnen?', // no field: never stale by itself
    ];
    expect(
      staleSuggestionKeys(
        pending,
        state({ existingTaskTitles: ['Tent Huren'], emptyEventFields: ['description'] }),
      ),
    ).toEqual(['task:tent huren', 'field:location', 'question:field:expectedAttendance']);
  });
});

describe('planTaskSuggestions: limits', () => {
  it('keeps every saved payload within the API limits', () => {
    const plan = planTaskSuggestions(
      output({
        tasks: [task({ title: 'T'.repeat(250), description: 'D'.repeat(2500) })],
        questions: [question({ options: ['ok', 'O'.repeat(120)], eventField: null })],
      }),
      refs,
      state(),
    );
    const [taskRow, questionRow] = plan.suggestions;
    expect((taskRow!.payload as { title: string }).title).toHaveLength(200);
    expect(taskRow!.title).toHaveLength(200);
    expect((taskRow!.payload as { description: string }).description).toHaveLength(2000);
    expect((questionRow!.payload as { options: string[] }).options).toEqual(['ok']);
  });
});
