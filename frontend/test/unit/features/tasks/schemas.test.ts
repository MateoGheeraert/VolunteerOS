import { describe, expect, it } from 'vitest';
import {
  EMPTY_TASK,
  EXTERNAL_ASSIGNEE,
  taskFormSchema,
  toTaskBody,
} from '@/features/tasks/schemas';

describe('taskFormSchema', () => {
  it('requires a title', () => {
    expect(taskFormSchema.safeParse({ ...EMPTY_TASK, title: '  ' }).success).toBe(false);
    expect(taskFormSchema.safeParse({ ...EMPTY_TASK, title: 'Tap' }).success).toBe(true);
  });

  it('requires a name for someone without an account', () => {
    const result = taskFormSchema.safeParse({
      ...EMPTY_TASK,
      title: 'Brood',
      assignee: EXTERNAL_ASSIGNEE,
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['assigneeName']);
  });

  it('accepts an empty or a valid due date only', () => {
    const base = { ...EMPTY_TASK, title: 'x' };
    expect(taskFormSchema.safeParse({ ...base, dueDate: '' }).success).toBe(true);
    expect(taskFormSchema.safeParse({ ...base, dueDate: '2026-12-01' }).success).toBe(true);
    expect(taskFormSchema.safeParse({ ...base, dueDate: 'morgen' }).success).toBe(false);
  });
});

describe('toTaskBody', () => {
  const base = { ...EMPTY_TASK, title: 'x' };

  it('sends a member, a typed-in name or nobody, never both', () => {
    expect(toTaskBody({ ...base, assignee: 'user-1', assigneeName: 'stale' })).toMatchObject({
      assigneeUserId: 'user-1',
      assigneeName: null,
    });
    expect(
      toTaskBody({ ...base, assignee: EXTERNAL_ASSIGNEE, assigneeName: 'Bakker Jan' }),
    ).toMatchObject({ assigneeUserId: null, assigneeName: 'Bakker Jan' });
    expect(toTaskBody(base)).toMatchObject({ assigneeUserId: null, assigneeName: null });
  });

  it('sends empty optional fields as null', () => {
    expect(toTaskBody(base)).toMatchObject({ description: null, dueDate: null });
  });
});
