import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import { dateTimeOutput } from '../../common/schemas.js';
import { event, task, taskAssignmentRequest, user } from '../../db/schema/index.js';
import { labelIdsSchema, labelSchema } from '../labels/labels.schemas.js';

/**
 * API contracts for tasks, derived from the Drizzle tables (see events.schemas.ts).
 */

/** At most one of the two assignee fields may be set. */
const singleAssignee = (value: { assigneeUserId?: string | null; assigneeName?: string | null }) =>
  !value.assigneeUserId || !value.assigneeName;
const singleAssigneeIssue = {
  message: 'Set either assigneeUserId or assigneeName, not both',
  path: ['assigneeName'],
};

const taskInput = createInsertSchema(task, {
  title: (schema) => schema.trim().min(1).max(200),
  description: (schema) => schema.trim().max(5000),
  // A calendar day (2026-12-01), no time.
  dueDate: () => z.iso.date(),
  assigneeUserId: (schema) => schema.min(1),
  assigneeName: (schema) => schema.trim().min(1).max(200),
});

// Fields a client may set. The event, the creator and timestamps are always set by the server.
const editableFields = {
  title: true,
  description: true,
  status: true,
  priority: true,
  dueDate: true,
  assigneeUserId: true,
  assigneeName: true,
} as const;

const labelIds = labelIdsSchema;

export const createTaskSchema = taskInput
  .pick(editableFields)
  .extend({ labelIds: labelIds.optional() })
  .refine(singleAssignee, singleAssigneeIssue)
  .meta({ id: 'CreateTask' });
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

/**
 * A partial update. Setting one assignee field clears the other, so switching from a typed-in
 * name to a member only needs `assigneeUserId`. `labelIds` replaces the task's labels.
 */
export const updateTaskSchema = taskInput
  .pick(editableFields)
  .extend({ labelIds })
  .partial()
  .refine(singleAssignee, singleAssigneeIssue)
  .meta({ id: 'UpdateTask' });
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

/** A person a task refers to. `active` is false once they have left the organization. */
export const taskPersonSchema = z
  .object({ userId: z.string(), name: z.string(), active: z.boolean() })
  .meta({ id: 'TaskPerson' });
export type TaskPersonDto = z.infer<typeof taskPersonSchema>;

export const taskAssigneeSchema = z
  .discriminatedUnion('type', [
    taskPersonSchema.extend({ type: z.literal('member') }),
    // Someone without an account, typed in by name.
    z.object({ type: z.literal('external'), name: z.string() }),
  ])
  .meta({ id: 'TaskAssignee' });
export type TaskAssigneeDto = z.infer<typeof taskAssigneeSchema>;

export const taskRequestSchema = createSelectSchema(taskAssignmentRequest, {
  createdAt: dateTimeOutput,
})
  .pick({ id: true, userId: true, createdAt: true })
  .extend(createSelectSchema(user).pick({ name: true }).shape)
  .meta({ id: 'TaskAssignmentRequest' });
export type TaskRequestDto = z.infer<typeof taskRequestSchema>;

export const taskSchema = createSelectSchema(task, {
  createdAt: dateTimeOutput,
  updatedAt: dateTimeOutput,
})
  // Soft deletion is internal, and the people are returned resolved below.
  .omit({ deletedAt: true, assigneeUserId: true, assigneeName: true, createdByUserId: true })
  .extend({
    assignee: taskAssigneeSchema.nullable(),
    createdBy: taskPersonSchema,
    labelIds: z.array(z.uuid()),
    /** Open requests to be assigned. Managers see all of them; members only their own. */
    pendingRequests: z.array(taskRequestSchema),
  })
  .meta({ id: 'Task' });
export type TaskDto = z.infer<typeof taskSchema>;

/** A member's unfinished tasks in one event: shown before removing them from the organization. */
export const openTaskCountSchema = z
  .object({ eventId: z.uuid(), eventName: z.string(), openTasks: z.number().int() })
  .meta({ id: 'OpenTaskCount' });
export type OpenTaskCountDto = z.infer<typeof openTaskCountSchema>;

/** A task on the caller's own list, which spans events: it says which event it belongs to. */
export const myTaskSchema = taskSchema
  .extend({
    event: createSelectSchema(event, { startsAt: dateTimeOutput, endsAt: dateTimeOutput })
      .pick({ id: true, name: true, status: true, startsAt: true, endsAt: true })
      .meta({ id: 'TaskEvent' }),
  })
  .meta({ id: 'MyTask' });

export const myTasksSchema = z
  .object({ tasks: z.array(myTaskSchema), labels: z.array(labelSchema) })
  .meta({ id: 'MyTasks' });
export type MyTasksDto = z.infer<typeof myTasksSchema>;
