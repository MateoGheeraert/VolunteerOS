import { describe, expect, it } from 'vitest';
import { buildTaskDraftContext, type TaskDraftContextInput } from './task-drafts.context.js';
import { planTaskDrafts } from './task-drafts.plan.js';
import type { TaskDraftOutput } from './task-drafts.schema.js';

const input = (overrides: Partial<TaskDraftContextInput> = {}): TaskDraftContextInput => ({
  language: 'nl-BE',
  today: '2026-11-19',
  event: { name: 'Kerstmarkt 2026', startDate: '2026-12-12', endDate: '2026-12-12' },
  members: [
    { userId: 'user-jan', name: 'Jan Peeters' },
    { userId: 'user-ada', name: 'Ada Admin' },
  ],
  currentTasks: [{ title: 'Standhouders mailen' }],
  text: 'tent huren tegen 1 dec, jan doet de kassa',
  ...overrides,
});

const draft = (overrides: Partial<TaskDraftOutput['tasks'][number]> = {}) => ({
  title: 'Tent huren',
  description: null,
  priority: 'medium' as const,
  dueDate: null,
  assigneeRef: null,
  assigneeName: null,
  ...overrides,
});

describe('buildTaskDraftContext', () => {
  it('gives members short references and keeps their ids out of the prompt', () => {
    const { prompt, memberRefs } = buildTaskDraftContext(input());
    expect(Object.fromEntries(memberRefs)).toEqual({ U1: 'user-jan', U2: 'user-ada' });
    expect(prompt).toContain('[U1] Jan Peeters');
    expect(prompt).not.toContain('user-jan');
  });

  it("includes the organizer's list, the dates and the tasks that already exist", () => {
    const { prompt } = buildTaskDraftContext(input());
    expect(prompt).toContain('today: 2026-11-19');
    expect(prompt).toContain('Kerstmarkt 2026, 2026-12-12 to 2026-12-12');
    expect(prompt).toContain('- Standhouders mailen');
    expect(prompt).toContain('tent huren tegen 1 dec, jan doet de kassa');
  });
});

describe('planTaskDrafts', () => {
  const refs = new Map([['U1', 'user-jan']]);
  const state = { existingTaskTitles: ['Standhouders mailen'] };

  it('maps a member reference to that member, and keeps other names as typed-in names', () => {
    const { tasks } = planTaskDrafts(
      {
        tasks: [
          draft({ title: 'Kassa', assigneeRef: 'U1' }),
          draft({ title: 'Tap', assigneeName: ' Brouwerij De Plukker ' }),
          draft({ title: 'Onbekend', assigneeRef: 'U9' }),
        ],
      },
      refs,
      state,
    );
    expect(tasks.map((t) => [t.title, t.assigneeUserId, t.assigneeName])).toEqual([
      ['Kassa', 'user-jan', null],
      ['Tap', null, 'Brouwerij De Plukker'],
      ['Onbekend', null, null],
    ]);
  });

  it('keeps only real calendar dates', () => {
    const { tasks } = planTaskDrafts(
      {
        tasks: [
          draft({ title: 'A', dueDate: '2026-12-01' }),
          draft({ title: 'B', dueDate: '2026-02-30' }),
          draft({ title: 'C', dueDate: '1 december' }),
        ],
      },
      refs,
      state,
    );
    expect(tasks.map((t) => t.dueDate)).toEqual(['2026-12-01', null, null]);
  });

  it('flags tasks the event already has and drops empty or repeated ones', () => {
    const { tasks } = planTaskDrafts(
      {
        tasks: [
          draft({ title: 'standhouders  MAILEN' }),
          draft({ title: '   ' }),
          draft({ title: 'Tent huren' }),
          draft({ title: 'tent huren' }),
        ],
      },
      refs,
      state,
    );
    expect(tasks.map((t) => [t.title, t.duplicateOf])).toEqual([
      ['standhouders MAILEN', 'Standhouders mailen'],
      ['Tent huren', null],
    ]);
  });

  it('keeps titles and descriptions within the limits, and at most 30 tasks', () => {
    const many = Array.from({ length: 35 }, (_, i) =>
      draft({ title: `Taak ${i} ${'x'.repeat(250)}`, description: 'd'.repeat(2500) }),
    );
    const { tasks } = planTaskDrafts({ tasks: many }, refs, state);
    expect(tasks).toHaveLength(30);
    expect(tasks[0]!.title).toHaveLength(200);
    expect(tasks[0]!.description).toHaveLength(2000);
  });
});
