import { describe, expect, it } from 'vitest';
import type { Task } from '@/api/generated/types.gen';
import {
  EMPTY_TASK,
  EXTERNAL_ASSIGNEE,
  taskFormSchema,
  taskToForm,
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

describe('taskToForm', () => {
  const task: Task = {
    id: '00000000-0000-4000-8000-000000000001',
    eventId: '00000000-0000-4000-8000-000000000002',
    title: 'Wisselgeld ophalen',
    description: null,
    status: 'in_progress',
    priority: 'high',
    dueDate: null,
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-01T10:00:00.000Z',
    assignee: null,
    createdBy: { userId: 'u1', name: 'Mateo', active: true },
    labelIds: [],
    pendingRequests: [],
  };

  it('turns empty fields into empty inputs', () => {
    expect(taskToForm(task)).toMatchObject({
      description: '',
      dueDate: '',
      assignee: '',
      assigneeName: '',
    });
  });

  it('selects a member by their user id', () => {
    const form = taskToForm({
      ...task,
      assignee: { type: 'member', userId: 'u2', name: 'Lies', active: true },
    });
    expect(form).toMatchObject({ assignee: 'u2', assigneeName: '' });
  });

  it('keeps a typed-in name as "someone without an account"', () => {
    const form = taskToForm({ ...task, assignee: { type: 'external', name: 'Bakker Jan' } });
    expect(form).toMatchObject({ assignee: EXTERNAL_ASSIGNEE, assigneeName: 'Bakker Jan' });
  });

  it('saves back unchanged', () => {
    const assigned: Task = {
      ...task,
      description: 'Muntjes',
      dueDate: '2026-12-16',
      assignee: { type: 'external', name: 'Bakker Jan' },
    };
    expect(toTaskBody(taskToForm(assigned))).toEqual({
      title: 'Wisselgeld ophalen',
      description: 'Muntjes',
      status: 'in_progress',
      priority: 'high',
      dueDate: '2026-12-16',
      assigneeUserId: null,
      assigneeName: 'Bakker Jan',
      labelIds: [],
    });
  });
});
