import { describe, expect, it } from 'vitest';
import type { Task } from '@/api/generated/types.gen';
import {
  assigneeOptions,
  eventOptions,
  filterTasks,
  isDueAfterEvent,
  isOverdue,
  NO_FILTERS,
  todayInBrussels,
  type TaskFilters,
} from '@/features/tasks/task-rules';

let nextId = 0;
const task = (overrides: Partial<Task> = {}): Task => ({
  id: `t${nextId++}`,
  eventId: 'e',
  title: 'Tap reinigen',
  description: null,
  status: 'todo',
  priority: 'medium',
  dueDate: null,
  assignee: null,
  createdBy: { userId: 'ada', name: 'Ada', active: true },
  labelIds: [],
  pendingRequests: [],
  createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-01T10:00:00.000Z',
  ...overrides,
});
const member = (userId: string, name = userId) =>
  ({ type: 'member', userId, name, active: true }) as const;

describe('todayInBrussels', () => {
  it('uses the Brussels date, not UTC', () => {
    // 23:30 UTC on 30 Nov is already 1 Dec in Brussels (UTC+1).
    expect(todayInBrussels(new Date('2026-11-30T23:30:00Z'))).toBe('2026-12-01');
    expect(todayInBrussels(new Date('2026-11-30T22:30:00Z'))).toBe('2026-11-30');
  });
});

describe('isOverdue', () => {
  const today = '2026-12-01';
  it('is overdue from the day after the due date, until done', () => {
    expect(isOverdue({ dueDate: '2026-11-30', status: 'todo' }, today)).toBe(true);
    expect(isOverdue({ dueDate: '2026-11-30', status: 'in_progress' }, today)).toBe(true);
    expect(isOverdue({ dueDate: '2026-12-01', status: 'todo' }, today)).toBe(false);
    expect(isOverdue({ dueDate: '2026-11-30', status: 'done' }, today)).toBe(false);
    expect(isOverdue({ dueDate: null, status: 'todo' }, today)).toBe(false);
  });
});

describe('isDueAfterEvent', () => {
  // Ends at 01:00 on 13 Dec in Brussels (00:00 UTC): its last day is the 13th.
  const endsAt = '2026-12-13T00:00:00.000Z';
  it('compares with the last day of the event in Brussels', () => {
    expect(isDueAfterEvent('2026-12-13', endsAt)).toBe(false);
    expect(isDueAfterEvent('2026-12-14', endsAt)).toBe(true);
    expect(isDueAfterEvent('', endsAt)).toBe(false);
  });
});

describe('filterTasks', () => {
  const mine = task({ title: 'mine', assignee: member('me'), status: 'in_progress' });
  const open = task({ title: 'open', priority: 'high', labelIds: ['bar'] });
  const lias = task({
    title: 'lia',
    assignee: member('lia'),
    pendingRequests: [{ id: 'r', userId: 'me', name: 'Me', createdAt: '' }],
  });
  const external = task({ title: 'external', assignee: { type: 'external', name: 'Jan' } });
  const all = [mine, open, lias, external];
  const titles = (filters: Partial<TaskFilters>) =>
    filterTasks(all, { ...NO_FILTERS, ...filters }, 'me').map((x) => x.title);

  it('keeps everything without filters', () => {
    expect(titles({})).toEqual(['mine', 'open', 'lia', 'external']);
  });

  it('narrows to my tasks', () => {
    expect(titles({ scope: 'mine' })).toEqual(['mine']);
  });

  it('filters by status, assignee, priority, label and open requests', () => {
    expect(titles({ status: 'in_progress' })).toEqual(['mine']);
    expect(titles({ assignee: 'unassigned' })).toEqual(['open']);
    expect(titles({ assignee: 'external' })).toEqual(['external']);
    expect(titles({ assignee: 'lia' })).toEqual(['lia']);
    expect(titles({ priority: 'high' })).toEqual(['open']);
    expect(titles({ labelId: 'bar' })).toEqual(['open']);
    expect(titles({ withRequests: true })).toEqual(['lia']);
  });
});

describe('assigneeOptions', () => {
  it('lists each member once, by name', () => {
    const tasks = [
      task({ assignee: member('z', 'Zoë') }),
      task({ assignee: member('a', 'Arne') }),
      task({ assignee: member('z', 'Zoë') }),
      task({ assignee: { type: 'external', name: 'Jan' } }),
    ];
    expect(assigneeOptions(tasks)).toEqual([
      { userId: 'a', name: 'Arne' },
      { userId: 'z', name: 'Zoë' },
    ]);
  });
});

describe('on my tasks, across events', () => {
  const market = {
    id: 'm',
    name: 'Kerstmarkt',
    status: 'published',
    startsAt: '',
    endsAt: '',
  } as const;
  const quiz = { id: 'q', name: 'Quiz', status: 'draft', startsAt: '', endsAt: '' } as const;
  const tasks = [
    { ...task({ title: 'a', eventId: 'q' }), event: quiz },
    { ...task({ title: 'b', eventId: 'm' }), event: market },
    { ...task({ title: 'c', eventId: 'q' }), event: quiz },
  ];

  it('filters by event', () => {
    const result = filterTasks(tasks, { ...NO_FILTERS, eventId: 'q' }, 'me');
    expect(result.map((x) => x.title)).toEqual(['a', 'c']);
  });

  it('offers each event once, by name', () => {
    expect(eventOptions(tasks)).toEqual([
      { id: 'm', name: 'Kerstmarkt' },
      { id: 'q', name: 'Quiz' },
    ]);
  });
});
