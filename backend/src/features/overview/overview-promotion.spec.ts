import { describe, expect, it } from 'vitest';
import { overduePromoTasks, promotionStatus } from './overview-rules.js';

const TODAY = '2026-11-25';

describe('overduePromoTasks', () => {
  it('finds unfinished Promotie tasks due before today', () => {
    const tasks = [
      { title: 'Affiches', status: 'todo' as const, dueDate: '2026-11-23' },
      { title: 'Flyers', status: 'in_progress' as const, dueDate: '2026-11-24' },
      { title: 'Facebook', status: 'done' as const, dueDate: '2026-11-15' },
      { title: 'Vandaag', status: 'todo' as const, dueDate: TODAY },
      { title: 'Zonder datum', status: 'todo' as const, dueDate: null },
    ];
    expect(overduePromoTasks(tasks, TODAY).map((task) => task.title)).toEqual([
      'Affiches',
      'Flyers',
    ]);
  });
});

describe('promotionStatus', () => {
  it('is neutral without Promotie tasks', () => {
    expect(promotionStatus([], TODAY)).toBe('neutral');
  });

  it('is red with an overdue Promotie task, green otherwise', () => {
    expect(promotionStatus([{ status: 'todo', dueDate: '2026-11-20' }], TODAY)).toBe('bad');
    expect(promotionStatus([{ status: 'todo', dueDate: '2026-12-01' }], TODAY)).toBe('ok');
    expect(promotionStatus([{ status: 'done', dueDate: '2026-11-20' }], TODAY)).toBe('ok');
  });
});
