import { describe, expect, it } from 'vitest';
import {
  budgetStatus,
  budgetTotals,
  coverage,
  daysUntil,
  nextTasks,
  phaseOf,
  planningStatus,
  selectHints,
  statusSuggestion,
  taskStats,
  taskStatus,
  type HintInput,
  type OverviewTask,
} from './overview-rules.js';

const NOW = new Date('2026-11-24T10:00:00Z');
const TODAY = '2026-11-24';
const daysFromNow = (days: number) => new Date(NOW.getTime() + days * 24 * 60 * 60 * 1000);

describe('phase', () => {
  const event = { startsAt: daysFromNow(1), endsAt: daysFromNow(2) };
  it('is before, during or after the event', () => {
    expect(phaseOf(event, NOW)).toBe('before');
    expect(phaseOf(event, daysFromNow(1.5))).toBe('during');
    expect(phaseOf(event, daysFromNow(2))).toBe('after');
  });

  it('counts whole days to the start, rounded up, never below 0', () => {
    expect(daysUntil(daysFromNow(0.2), NOW)).toBe(1);
    expect(daysUntil(daysFromNow(23), NOW)).toBe(23);
    expect(daysUntil(daysFromNow(-3), NOW)).toBe(0);
  });
});

const task = (overrides: Partial<OverviewTask> = {}): OverviewTask => ({
  status: 'todo',
  priority: 'medium',
  dueDate: null,
  assigned: true,
  ...overrides,
});

describe('task card', () => {
  it('counts done, in progress, unassigned, overdue and due soon', () => {
    const stats = taskStats(
      [
        task({ status: 'done', dueDate: '2026-11-01' }),
        task({ status: 'in_progress', dueDate: '2026-11-20' }),
        task({ assigned: false, dueDate: '2026-11-30' }),
        task({ assigned: false, priority: 'high', dueDate: '2026-12-20' }),
      ],
      TODAY,
    );
    expect(stats).toEqual({
      total: 4,
      done: 1,
      inProgress: 1,
      todo: 2,
      unassigned: 2,
      overdue: 1,
      dueSoon: 1,
      highPriorityUnassigned: 1,
    });
  });

  it('is neutral when empty, red when overdue, amber when due soon or important and unassigned', () => {
    expect(taskStatus(taskStats([], TODAY))).toBe('neutral');
    expect(taskStatus(taskStats([task({ dueDate: '2026-11-23' })], TODAY))).toBe('bad');
    expect(taskStatus(taskStats([task({ dueDate: '2026-12-01' })], TODAY))).toBe('warn');
    expect(taskStatus(taskStats([task({ priority: 'high', assigned: false })], TODAY))).toBe(
      'warn',
    );
    expect(taskStatus(taskStats([task({ dueDate: '2026-12-02' })], TODAY))).toBe('ok');
    // A done task is never late.
    expect(taskStatus(taskStats([task({ status: 'done', dueDate: '2026-01-01' })], TODAY))).toBe(
      'ok',
    );
  });

  it('lists unfinished tasks by due date, then undated ones by priority', () => {
    const tasks = [
      { ...task({ dueDate: null, priority: 'low' }), id: 'undated-low' },
      { ...task({ dueDate: '2026-12-05' }), id: 'later' },
      { ...task({ status: 'done', dueDate: '2026-11-01' }), id: 'done' },
      { ...task({ dueDate: null, priority: 'high' }), id: 'undated-high' },
      { ...task({ dueDate: '2026-11-20' }), id: 'overdue' },
    ];
    expect(nextTasks(tasks, 4).map((t) => t.id)).toEqual([
      'overdue',
      'later',
      'undated-high',
      'undated-low',
    ]);
  });
});

describe('planning card', () => {
  it('counts places taken up to each shift capacity, and the confirmed part', () => {
    expect(
      coverage([
        { capacity: 3, assignments: ['confirmed', 'proposed'] },
        { capacity: 1, assignments: ['confirmed', 'confirmed'] },
      ]),
    ).toEqual({ positions: 4, filled: 3, confirmed: 2 });
  });

  const status = (filled: number, positions: number, daysToStart: number, applications = 0) =>
    planningStatus({
      coverage: { positions, filled, confirmed: 0 },
      applications,
      phase: 'before',
      daysToStart,
    });

  it('is green when full', () => expect(status(15, 15, 5)).toBe('ok'));
  it('is amber when partly filled far ahead', () => expect(status(2, 15, 30)).toBe('warn'));
  it('is red when under half filled within 21 days', () => expect(status(7, 15, 21)).toBe('bad'));
  it('is amber when at least half filled close to the event', () =>
    expect(status(8, 15, 10)).toBe('warn'));
  it('is amber when empty far ahead, red when empty close by', () => {
    expect(status(0, 0, 40)).toBe('warn');
    expect(status(0, 0, 14)).toBe('bad');
  });
  it('is neutral with volunteers but no shifts', () => expect(status(0, 0, 14, 5)).toBe('neutral'));
  it('is neutral after the event', () =>
    expect(
      planningStatus({
        coverage: { positions: 10, filled: 0, confirmed: 0 },
        applications: 0,
        phase: 'after',
        daysToStart: 0,
      }),
    ).toBe('neutral'));
});

describe('budget card', () => {
  const totals = budgetTotals([
    { type: 'expense', estimatedCents: 60000, actualCents: 42000 },
    { type: 'expense', estimatedCents: null, actualCents: 1000 },
    { type: 'income', estimatedCents: 80000, actualCents: null },
  ]);

  it('adds up estimates and actual amounts separately', () => {
    expect(totals).toEqual({
      income: { estimated: 80000, actual: 0 },
      expense: { estimated: 60000, actual: 43000 },
      result: { estimated: 20000, actual: -43000 },
    });
  });

  const spent = (actual: number) =>
    budgetStatus({
      entryCount: 1,
      totals: budgetTotals([{ type: 'expense', estimatedCents: 60000, actualCents: actual }]),
      phase: 'before',
    });

  it('is green under 90%, amber from 90%, red over the estimate', () => {
    expect(spent(42000)).toBe('ok');
    expect(spent(54000)).toBe('warn');
    expect(spent(60001)).toBe('bad');
  });

  it('is red when money is spent without any estimate', () => {
    const unplanned = budgetTotals([{ type: 'expense', estimatedCents: null, actualCents: 500 }]);
    expect(budgetStatus({ entryCount: 1, totals: unplanned, phase: 'before' })).toBe('bad');
    const incomeOnly = budgetTotals([{ type: 'income', estimatedCents: 1000, actualCents: null }]);
    expect(budgetStatus({ entryCount: 1, totals: incomeOnly, phase: 'before' })).toBe('ok');
  });

  it('is neutral without entries', () =>
    expect(budgetStatus({ entryCount: 0, totals, phase: 'before' })).toBe('neutral'));

  it('judges the result after the event', () => {
    expect(budgetStatus({ entryCount: 3, totals, phase: 'after' })).toBe('bad');
    const profit = budgetTotals([{ type: 'income', estimatedCents: null, actualCents: 100 }]);
    expect(budgetStatus({ entryCount: 1, totals: profit, phase: 'after' })).toBe('ok');
  });
});

describe('status suggestion', () => {
  it('proposes publishing a draft and completing a published event that is over', () => {
    expect(statusSuggestion({ status: 'draft', endsAt: daysFromNow(5) }, NOW)).toBe('publish');
    expect(statusSuggestion({ status: 'published', endsAt: daysFromNow(-1) }, NOW)).toBe(
      'complete',
    );
    expect(statusSuggestion({ status: 'published', endsAt: daysFromNow(5) }, NOW)).toBeNull();
    expect(statusSuggestion({ status: 'completed', endsAt: daysFromNow(-1) }, NOW)).toBeNull();
  });
});

describe('Mila hints', () => {
  const input = (overrides: Partial<HintInput> = {}): HintInput => ({
    canManage: true,
    aiEnabled: true,
    readOnly: false,
    phase: 'before',
    daysToStart: 30,
    now: NOW,
    taskCount: 5,
    pendingTaskSuggestions: { count: 0, newestAt: null },
    findMissingRunning: false,
    lastFindMissing: { id: 'run-1', finishedAt: daysFromNow(-2) },
    statusSuggestionShown: false,
    dismissed: new Map(),
    ...overrides,
  });
  const keys = (overrides: Partial<HintInput> = {}) =>
    selectHints(input(overrides)).map((h) => h.key);

  it('offers to set up tasks when there are none, highlighted', () => {
    expect(selectHints(input({ taskCount: 0 }))).toEqual([
      { key: 'tasks.setup', card: 'tasks', fingerprint: 'empty', highlighted: true },
    ]);
  });

  it('says nothing generic when tasks exist and the check is recent', () => {
    expect(keys()).toEqual([]);
  });

  it('puts waiting suggestions first, one hint per card', () => {
    const newestAt = daysFromNow(-1);
    expect(
      selectHints(input({ taskCount: 0, pendingTaskSuggestions: { count: 4, newestAt } })),
    ).toEqual([
      {
        key: 'tasks.review',
        card: 'tasks',
        fingerprint: newestAt.toISOString(),
        highlighted: true,
      },
    ]);
  });

  it('offers the missing-task check when it never ran or ran over 14 days ago', () => {
    expect(keys({ lastFindMissing: null })).toEqual(['tasks.find_missing']);
    expect(keys({ lastFindMissing: { id: 'r', finishedAt: daysFromNow(-15) } })).toEqual([
      'tasks.find_missing',
    ]);
    expect(keys({ lastFindMissing: { id: 'r', finishedAt: daysFromNow(-13) } })).toEqual([]);
  });

  it('does not offer the check close to the event or while it runs', () => {
    expect(keys({ lastFindMissing: null, daysToStart: 7 })).toEqual([]);
    expect(keys({ lastFindMissing: null, findMissingRunning: true })).toEqual([]);
  });

  it('stays quiet for members, without AI, on archived events and once the event started', () => {
    const empty = { taskCount: 0 };
    expect(keys({ ...empty, canManage: false })).toEqual([]);
    expect(keys({ ...empty, aiEnabled: false })).toEqual([]);
    expect(keys({ ...empty, readOnly: true })).toEqual([]);
    expect(keys({ ...empty, phase: 'during' })).toEqual([]);
  });

  it('highlights nothing while the status banner speaks for Mila', () => {
    const hints = selectHints(input({ lastFindMissing: null, statusSuggestionShown: true }));
    expect(hints).toMatchObject([{ key: 'tasks.find_missing', highlighted: false }]);
  });

  it('shows the setup offer in full even next to the status banner: it is the empty state', () => {
    const hints = selectHints(input({ taskCount: 0, statusSuggestionShown: true }));
    expect(hints).toMatchObject([{ key: 'tasks.setup', highlighted: true }]);
  });

  it('keeps a dismissed hint away until its situation changes', () => {
    const dismissed = new Map([['tasks.find_missing', 'run-1']]);
    const stale = { id: 'run-1', finishedAt: daysFromNow(-20) };
    expect(keys({ lastFindMissing: stale, dismissed })).toEqual([]);
    const newer = { id: 'run-2', finishedAt: daysFromNow(-20) };
    expect(keys({ lastFindMissing: newer, dismissed })).toEqual(['tasks.find_missing']);
  });

  it('falls through to the next hint of a card when the first is dismissed', () => {
    const newestAt = daysFromNow(-1);
    const dismissed = new Map([['tasks.review', newestAt.toISOString()]]);
    expect(
      keys({ taskCount: 0, pendingTaskSuggestions: { count: 2, newestAt }, dismissed }),
    ).toEqual(['tasks.setup']);
  });
});
