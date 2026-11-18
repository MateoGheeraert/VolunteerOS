import type { Task } from '@/api/generated/types.gen';
import { utcIsoToBrussels } from '@/lib/format';
import type { TaskPriority, TaskStatus } from './schemas';

/** Today's date in Brussels ("2026-11-18"): due dates are Brussels calendar days. */
export const todayInBrussels = (now = new Date()) => utcIsoToBrussels(now.toISOString()).date;

/** Past its due date and not done. Dates compare correctly as ISO strings. */
export const isOverdue = (task: Pick<Task, 'dueDate' | 'status'>, today: string) =>
  task.dueDate !== null && task.status !== 'done' && task.dueDate < today;

/** A due date after the event's last day: allowed, but worth a warning. */
export const isDueAfterEvent = (dueDate: string, eventEndsAt: string) =>
  dueDate !== '' && dueDate > utcIsoToBrussels(eventEndsAt).date;

/** The member who has the task, if it is one. */
export const assigneeUserId = (task: Pick<Task, 'assignee'>) =>
  task.assignee?.type === 'member' ? task.assignee.userId : null;

/**
 * - `scope`: 'mine' is the caller's tasks; 'all' is everything the backend returned (every task for
 *   managers, own + unassigned for members).
 * - `assignee`: 'all', 'unassigned', 'external' (anyone without an account) or a member's user id.
 */
export interface TaskFilters {
  scope: 'mine' | 'all';
  /** On "my tasks", which spans events: 'all' or one event's id. */
  eventId: string;
  status: TaskStatus | 'all';
  assignee: string;
  priority: TaskPriority | 'all';
  labelId: string;
  withRequests: boolean;
}

export const NO_FILTERS: TaskFilters = {
  scope: 'all',
  eventId: 'all',
  status: 'all',
  assignee: 'all',
  priority: 'all',
  labelId: 'all',
  withRequests: false,
};

function matchesAssignee(task: Task, assignee: string): boolean {
  if (assignee === 'all') return true;
  if (assignee === 'unassigned') return task.assignee === null;
  if (assignee === 'external') return task.assignee?.type === 'external';
  return assigneeUserId(task) === assignee;
}

export function filterTasks<T extends Task>(tasks: T[], filters: TaskFilters, userId: string): T[] {
  return tasks.filter(
    (task) =>
      (filters.scope === 'all' || assigneeUserId(task) === userId) &&
      (filters.eventId === 'all' || task.eventId === filters.eventId) &&
      (filters.status === 'all' || task.status === filters.status) &&
      matchesAssignee(task, filters.assignee) &&
      (filters.priority === 'all' || task.priority === filters.priority) &&
      (filters.labelId === 'all' || task.labelIds.includes(filters.labelId)) &&
      (!filters.withRequests || task.pendingRequests.length > 0),
  );
}

/** The members who have a task in the list, for the assignee filter, by name. */
export function assigneeOptions(tasks: Task[]): { userId: string; name: string }[] {
  const byId = new Map<string, string>();
  for (const task of tasks) {
    if (task.assignee?.type === 'member') byId.set(task.assignee.userId, task.assignee.name);
  }
  return [...byId]
    .map(([userId, name]) => ({ userId, name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'nl'));
}

/** The events tasks belong to (on "my tasks"), for the event filter, by name. */
export function eventOptions(tasks: { event?: { id: string; name: string } }[]) {
  const byId = new Map<string, string>();
  for (const task of tasks) if (task.event) byId.set(task.event.id, task.event.name);
  return [...byId]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'nl'));
}
