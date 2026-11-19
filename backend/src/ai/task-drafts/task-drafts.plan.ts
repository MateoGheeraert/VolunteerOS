import type { TaskDraftOutput } from './task-drafts.schema.js';

/** One task as Mila understood it, for the organizer to check before it is created. */
export interface DraftTask {
  title: string;
  description: string | null;
  priority: 'low' | 'medium' | 'high';
  dueDate: string | null;
  assigneeUserId: string | null;
  assigneeName: string | null;
  /** The existing task with the same title, if any: the dialog leaves it unticked. */
  duplicateOf: string | null;
}

/** More than this in one list is almost certainly not a task list. */
export const MAX_DRAFT_TASKS = 30;

const normalize = (text: string) => text.trim().toLowerCase().replace(/\s+/g, ' ');

/** Cleans up the model's output: real dates, known members, limits, no repeats. */
export function planTaskDrafts(
  output: TaskDraftOutput,
  memberRefs: ReadonlyMap<string, string>,
  state: { existingTaskTitles: string[] },
): { tasks: DraftTask[] } {
  const existing = new Map(state.existingTaskTitles.map((title) => [normalize(title), title]));
  const seen = new Set<string>();
  const tasks: DraftTask[] = [];

  for (const item of output.tasks) {
    const title = item.title.trim().replace(/\s+/g, ' ').slice(0, 200);
    const key = normalize(title);
    if (!title || seen.has(key)) continue;
    if (tasks.length >= MAX_DRAFT_TASKS) break;
    seen.add(key);

    const assigneeUserId = (item.assigneeRef && memberRefs.get(item.assigneeRef)) ?? null;
    const assigneeName = assigneeUserId ? null : item.assigneeName?.trim().slice(0, 200) || null;
    tasks.push({
      title,
      description: item.description?.trim().slice(0, 2000) || null,
      priority: item.priority,
      dueDate: isCalendarDate(item.dueDate) ? item.dueDate : null,
      assigneeUserId,
      assigneeName,
      duplicateOf: existing.get(key) ?? null,
    });
  }
  return { tasks };
}

/** `YYYY-MM-DD` that exists on the calendar (not 30 February). */
function isCalendarDate(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
