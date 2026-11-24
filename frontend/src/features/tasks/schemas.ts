import { z } from 'zod';
import type { CreateTask, Task } from '@/api/generated/types.gen';
import { zCreateTask } from '@/api/generated/zod.gen';
import { MAX_LABELS_PER_ITEM } from '@/features/labels/schemas';
import { msg } from '@/i18n/keys';

/**
 * The task form, shared by the forms (instant feedback) and the server actions
 * (validated again). Messages are translation keys; limits and allowed values come from the
 * generated API schema, so they follow the backend.
 */
const limits = {
  title: zCreateTask.shape.title.maxLength ?? 200,
  description: zCreateTask.shape.description.unwrap().unwrap().maxLength ?? 5000,
  assigneeName: zCreateTask.shape.assigneeName.unwrap().unwrap().maxLength ?? 200,
};

/** In board order: the columns, left to right. */
export const TASK_STATUSES = zCreateTask.shape.status.unwrap().options;
export type TaskStatus = (typeof TASK_STATUSES)[number];
/** High first, as the backend sorts. */
export const TASK_PRIORITIES = [...zCreateTask.shape.priority.unwrap().options].reverse();
export type TaskPriority = Task['priority'];

/** The assignee select's value for "someone without an account": the name goes in its own field. */
export const EXTERNAL_ASSIGNEE = '__external';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const taskFormSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, msg('taskForm.validation.titleRequired'))
      .max(limits.title, msg('taskForm.validation.titleTooLong')),
    description: z
      .string()
      .trim()
      .max(limits.description, msg('taskForm.validation.descriptionTooLong')),
    status: z.enum(TASK_STATUSES),
    priority: z.enum(TASK_PRIORITIES),
    /** '' when there is no due date. */
    dueDate: z.union([
      z.literal(''),
      z.string().regex(DATE, msg('taskForm.validation.dueDateInvalid')),
    ]),
    /** '' for nobody, EXTERNAL_ASSIGNEE for a typed-in name, otherwise a member's user id. */
    assignee: z.string(),
    assigneeName: z
      .string()
      .trim()
      .max(limits.assigneeName, msg('taskForm.validation.assigneeNameTooLong')),
    labelIds: z.array(z.uuid()).max(MAX_LABELS_PER_ITEM),
  })
  .refine((value) => value.assignee !== EXTERNAL_ASSIGNEE || value.assigneeName.length > 0, {
    message: msg('taskForm.validation.assigneeNameRequired'),
    path: ['assigneeName'],
  });

export type TaskFormValues = z.infer<typeof taskFormSchema>;

export const EMPTY_TASK: TaskFormValues = {
  title: '',
  description: '',
  status: 'todo',
  priority: 'medium',
  dueDate: '',
  assignee: '',
  assigneeName: '',
  labelIds: [],
};

/** An existing task → the form's values, to edit it. */
export function taskToForm(task: Task): TaskFormValues {
  const { assignee } = task;
  return {
    title: task.title,
    description: task.description ?? '',
    status: task.status,
    priority: task.priority,
    dueDate: task.dueDate ?? '',
    assignee:
      assignee === null ? '' : assignee.type === 'member' ? assignee.userId : EXTERNAL_ASSIGNEE,
    assigneeName: assignee?.type === 'external' ? assignee.name : '',
    labelIds: task.labelIds,
  };
}

/** Which form field a Nest validation error on an API field belongs to. */
export const taskApiFields = { assigneeUserId: 'assignee' };

/** Form values → API body for a new task. */
export function toTaskBody(values: TaskFormValues): Required<CreateTask> {
  const external = values.assignee === EXTERNAL_ASSIGNEE;
  return {
    title: values.title,
    description: values.description || null,
    status: values.status,
    priority: values.priority,
    dueDate: values.dueDate || null,
    assigneeUserId: values.assignee && !external ? values.assignee : null,
    assigneeName: external ? values.assigneeName : null,
    labelIds: values.labelIds,
  };
}

export const changeTaskStatusSchema = z.object({ status: z.enum(TASK_STATUSES) });
