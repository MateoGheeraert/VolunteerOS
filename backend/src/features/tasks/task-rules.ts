import type { TaskRow, TaskStatus } from '../../db/schema/index.js';
import type { UpdateTaskInput } from './tasks.schemas.js';

type TaskAssignment = Pick<TaskRow, 'assigneeUserId' | 'assigneeName'>;

/** Who is looking at an event's tasks. Managers: org owners, admins and the event's managers. */
export interface TaskViewer {
  userId: string;
  canManage: boolean;
}

export const isUnassigned = (task: TaskAssignment) =>
  task.assigneeUserId === null && task.assigneeName === null;

/** Unfinished tasks are released when their assignee leaves the organization. */
export const isOpen = (status: TaskStatus) => status !== 'done';

/**
 * Managers see every task of the event. Other members see the tasks assigned to them, and the
 * unassigned ones so they can ask for them. Tasks given to someone else stay hidden.
 */
export const canSeeTask = (viewer: TaskViewer, task: TaskAssignment) =>
  viewer.canManage || task.assigneeUserId === viewer.userId || isUnassigned(task);

/**
 * Why a member who doesn't manage the event may not make this change, or null when they may.
 * They move their own tasks between statuses, and can give a task back by unassigning
 * themselves; everything else is for managers.
 */
export function memberUpdateError(
  userId: string,
  task: TaskAssignment,
  input: UpdateTaskInput,
): string | null {
  if (task.assigneeUserId !== userId) {
    return 'Only managers can change tasks that are not assigned to you';
  }
  for (const [field, value] of Object.entries(input)) {
    if (value === undefined) continue;
    if (field === 'status') continue;
    // Giving the task back clears the assignee; a member's own task has no typed-in name.
    if ((field === 'assigneeUserId' || field === 'assigneeName') && value === null) continue;
    return 'You can only change the status of your task, or give it back';
  }
  return null;
}
