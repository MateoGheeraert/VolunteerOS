import { sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { deletedAt } from '../soft-delete.js';
import { user } from './auth.js';
import { event } from './events.js';
import { label } from './labels.js';

export const taskStatusEnum = pgEnum('task_status', ['todo', 'in_progress', 'done']);
/** Declared low → high, so `order by priority desc` puts high first. */
export const taskPriorityEnum = pgEnum('task_priority', ['low', 'medium', 'high']);
export const taskAssignmentRequestStatusEnum = pgEnum('task_assignment_request_status', [
  'pending',
  'approved',
  'declined',
  'cancelled',
]);

export type TaskStatus = (typeof taskStatusEnum.enumValues)[number];
export type TaskPriority = (typeof taskPriorityEnum.enumValues)[number];
export type TaskAssignmentRequestStatus =
  (typeof taskAssignmentRequestStatusEnum.enumValues)[number];

const createdAt = timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = timestamp('updated_at', { withTimezone: true })
  .notNull()
  .defaultNow()
  .$onUpdate(() => new Date());

/**
 * A preparation task of one event. The assignee is an organization member (`assignee_user_id`),
 * a name typed in for someone without an account (`assignee_name`), or nobody: never both.
 * Member assignees reference the user, not the `member` row, because Better Auth hard-deletes
 * members; a done task keeps its assignee after they leave the organization.
 */
export const task = pgTable(
  'task',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => event.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    status: taskStatusEnum('status').notNull().default('todo'),
    priority: taskPriorityEnum('priority').notNull().default('medium'),
    /** A calendar day, no time: overdue is judged against "today" in Europe/Brussels. */
    dueDate: date('due_date', { mode: 'string' }),
    assigneeUserId: text('assignee_user_id').references(() => user.id),
    assigneeName: text('assignee_name'),
    createdByUserId: text('created_by_user_id')
      .notNull()
      .references(() => user.id),
    createdAt,
    updatedAt,
    deletedAt: deletedAt(),
  },
  (t) => [
    index('task_event_id_idx').on(t.eventId),
    index('task_assignee_user_id_idx').on(t.assigneeUserId),
    check('task_single_assignee', sql`${t.assigneeUserId} is null or ${t.assigneeName} is null`),
  ],
);

/** A label on a task. */
export const taskLabelLink = pgTable(
  'task_label_link',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => task.id, { onDelete: 'cascade' }),
    labelId: uuid('label_id')
      .notNull()
      .references(() => label.id, { onDelete: 'cascade' }),
    createdAt,
    deletedAt: deletedAt(),
  },
  (t) => [
    uniqueIndex('task_label_link_task_label_uidx')
      .on(t.taskId, t.labelId)
      .where(sql`${t.deletedAt} is null`),
    index('task_label_link_label_id_idx').on(t.labelId),
  ],
);

/** A member asking to be assigned an unassigned task; a manager approves or declines it. */
export const taskAssignmentRequest = pgTable(
  'task_assignment_request',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => task.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    status: taskAssignmentRequestStatusEnum('status').notNull().default('pending'),
    createdAt,
    updatedAt,
    deletedAt: deletedAt(),
  },
  (t) => [
    // One open request per member and task; decided requests stay as history.
    uniqueIndex('task_assignment_request_pending_uidx')
      .on(t.taskId, t.userId)
      .where(sql`${t.status} = 'pending' and ${t.deletedAt} is null`),
    index('task_assignment_request_user_id_idx').on(t.userId),
  ],
);

export type TaskRow = typeof task.$inferSelect;
export type TaskLabelLinkRow = typeof taskLabelLink.$inferSelect;
export type TaskAssignmentRequestRow = typeof taskAssignmentRequest.$inferSelect;
