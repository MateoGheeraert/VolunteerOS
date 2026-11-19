import { describe, expect, it } from 'vitest';
import {
  buildTaskSuggestionContext,
  type TaskSuggestionContextInput,
} from './task-suggestions.context.js';

const input = (
  overrides: Partial<TaskSuggestionContextInput> = {},
): TaskSuggestionContextInput => ({
  language: 'nl-BE',
  today: '2026-11-19',
  event: {
    id: 'e7a1c0de-0000-4000-8000-000000000001',
    name: 'Kerstmarkt 2026',
    eventType: 'market',
    description: 'Gezellige markt met 20 standen',
    location: null,
    startDate: '2026-12-12',
    endDate: '2026-12-12',
    expectedAttendance: null,
  },
  previousEdition: {
    id: 'e7a1c0de-0000-4000-8000-000000000002',
    name: 'Kerstmarkt 2025',
    startDate: '2025-12-13',
    actualAttendance: 750,
    retrospective: 'Te weinig verlichting aan de ingang.',
    tasks: [
      {
        id: 'a1a1a1a1-0000-4000-8000-000000000001',
        title: 'Tent huren',
        description: null,
        priority: 'high',
        status: 'done',
        dueDate: '2025-11-22',
      },
      {
        id: 'a1a1a1a1-0000-4000-8000-000000000002',
        title: 'Glühwein bestellen',
        description: 'Bij de Spar',
        priority: 'medium',
        status: 'todo',
        dueDate: null,
      },
    ],
  },
  currentTasks: [{ id: 'b2b2b2b2-0000-4000-8000-000000000001', title: 'Standhouders mailen' }],
  memories: [
    {
      id: 'c3c3c3c3-0000-4000-8000-000000000001',
      content: 'De tap komt van brouwerij De Plukker.',
      scope: 'organization',
      copiedFromPreviousEdition: false,
    },
    {
      id: 'c3c3c3c3-0000-4000-8000-000000000002',
      content: 'Markt staat binnen in de parochiezaal.',
      scope: 'event',
      copiedFromPreviousEdition: true,
    },
  ],
  answeredQuestions: [{ question: 'Is er een bar?', answer: 'Ja, met tap' }],
  earlierSuggestions: [{ title: 'Kerstman boeken', status: 'rejected' }],
  ...overrides,
});

describe('buildTaskSuggestionContext', () => {
  it('gives every record a short reference and maps it back to the record', () => {
    const { refs } = buildTaskSuggestionContext(input());
    expect(Object.fromEntries(refs)).toEqual({
      E: { type: 'event', id: 'e7a1c0de-0000-4000-8000-000000000001', label: 'Kerstmarkt 2026' },
      P: { type: 'event', id: 'e7a1c0de-0000-4000-8000-000000000002', label: 'Kerstmarkt 2025' },
      P1: { type: 'task', id: 'a1a1a1a1-0000-4000-8000-000000000001', label: 'Tent huren' },
      P2: { type: 'task', id: 'a1a1a1a1-0000-4000-8000-000000000002', label: 'Glühwein bestellen' },
      T1: {
        type: 'task',
        id: 'b2b2b2b2-0000-4000-8000-000000000001',
        label: 'Standhouders mailen',
      },
      M1: {
        type: 'memory',
        id: 'c3c3c3c3-0000-4000-8000-000000000001',
        label: 'De tap komt van brouwerij De Plukker.',
      },
      M2: {
        type: 'memory',
        id: 'c3c3c3c3-0000-4000-8000-000000000002',
        label: 'Markt staat binnen in de parochiezaal.',
      },
    });
  });

  it('describes the event, with the fields that are still empty', () => {
    const { prompt } = buildTaskSuggestionContext(input());
    expect(prompt).toContain('[E] Kerstmarkt 2026');
    expect(prompt).toContain('type: market');
    expect(prompt).toContain('dates: 2026-12-12 to 2026-12-12 (1 day)');
    expect(prompt).toContain('description: Gezellige markt met 20 standen');
    expect(prompt).toContain('empty fields: location, expectedAttendance');
    expect(prompt).toContain('today: 2026-11-19');
    expect(prompt).toContain('output language: nl-BE');
  });

  it("lists the previous edition's tasks with how long before that event they were due", () => {
    const { prompt } = buildTaskSuggestionContext(input());
    expect(prompt).toContain('[P] Kerstmarkt 2025');
    expect(prompt).toContain('actual attendance: 750');
    expect(prompt).toContain('lessons learned: Te weinig verlichting aan de ingang.');
    expect(prompt).toContain('[P1] Tent huren | priority high | done | due 21 days before');
    expect(prompt).toContain(
      '[P2] Glühwein bestellen | priority medium | todo | no due date | Bij de Spar',
    );
  });

  it('lists current tasks, memories, answers and earlier suggestions', () => {
    const { prompt } = buildTaskSuggestionContext(input());
    expect(prompt).toContain('[T1] Standhouders mailen');
    expect(prompt).toContain('[M1] (organization) De tap komt van brouwerij De Plukker.');
    expect(prompt).toContain('[M2] (event, from last year) Markt staat binnen in de parochiezaal.');
    expect(prompt).toContain('Q: Is er een bar? A: Ja, met tap');
    expect(prompt).toContain('- Kerstman boeken (rejected)');
  });

  it('never puts database ids in the prompt', () => {
    const { prompt } = buildTaskSuggestionContext(input());
    expect(prompt).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
  });

  it('says so when there is no previous edition or nothing else to list', () => {
    const { prompt, refs } = buildTaskSuggestionContext(
      input({
        previousEdition: null,
        currentTasks: [],
        memories: [],
        answeredQuestions: [],
        earlierSuggestions: [],
      }),
    );
    expect(prompt).toContain('No previous edition.');
    expect(prompt).toContain('Current tasks: none');
    expect(prompt).toContain('Memory: none');
    expect([...refs.keys()]).toEqual(['E']);
  });
});
