import { z } from 'zod';
import type { CreateTask, Task, TaskLabel } from '@/api/generated/types.gen';
import { zCreateTask, zCreateTaskLabel } from '@/api/generated/zod.gen';
import { msg } from '@/i18n/keys';

/**
 * The task form and the label form, shared by the forms (instant feedback) and the server actions
 * (validated again). Messages are translation keys; limits and allowed values come from the
 * generated API schema, so they follow the backend.
 */
const limits = {
  title: zCreateTask.shape.title.maxLength ?? 200,
  description: zCreateTask.shape.description.unwrap().unwrap().maxLength ?? 5000,
  assigneeName: zCreateTask.shape.assigneeName.unwrap().unwrap().maxLength ?? 200,
  labelName: zCreateTaskLabel.shape.name.maxLength ?? 50,
};

/** In board order: the columns, left to right. */
export const TASK_STATUSES = zCreateTask.shape.status.unwrap().options;
export type TaskStatus = (typeof TASK_STATUSES)[number];
/** High first, as the backend sorts. */
export const TASK_PRIORITIES = [...zCreateTask.shape.priority.unwrap().options].reverse();
export type TaskPriority = Task['priority'];
export const LABEL_COLORS = zCreateTaskLabel.shape.color.unwrap().options;
export type LabelColor = TaskLabel['color'];

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
    labelIds: z.array(z.uuid()).max(20),
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

export const labelFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, msg('taskLabels.validation.nameRequired'))
    .max(limits.labelName, msg('taskLabels.validation.nameTooLong')),
  color: z.enum(LABEL_COLORS),
});
export type LabelFormValues = z.infer<typeof labelFormSchema>;

/**
 * One inline edit in the task pane: any subset of the task's fields. Empty text clears an
 * optional field.
 */
export const taskPatchSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, msg('taskForm.validation.titleRequired'))
      .max(limits.title, msg('taskForm.validation.titleTooLong')),
    description: z
      .string()
      .trim()
      .max(limits.description, msg('taskForm.validation.descriptionTooLong'))
      .nullable(),
    status: z.enum(TASK_STATUSES),
    priority: z.enum(TASK_PRIORITIES),
    dueDate: z.string().regex(DATE, msg('taskForm.validation.dueDateInvalid')).nullable(),
    assigneeUserId: z.string().min(1).nullable(),
    assigneeName: z
      .string()
      .trim()
      .min(1, msg('taskForm.validation.assigneeNameRequired'))
      .max(limits.assigneeName, msg('taskForm.validation.assigneeNameTooLong'))
      .nullable(),
    labelIds: z.array(z.uuid()).max(20),
  })
  .partial();
export type TaskPatch = z.infer<typeof taskPatchSchema>;
