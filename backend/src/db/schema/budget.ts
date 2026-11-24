import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
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
import { task } from './tasks.js';

export const budgetEntryTypeEnum = pgEnum('budget_entry_type', ['income', 'expense']);
export type BudgetEntryType = (typeof budgetEntryTypeEnum.enumValues)[number];

/** The largest amount one entry may hold: € 9.999.999,99, which fits an integer of cents. */
export const MAX_BUDGET_CENTS = 999_999_999;

const createdAt = timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

/**
 * One line of an event's budget: money expected and/or actually coming in (`income`) or going
 * out (`expense`). Amounts are whole euro cents, never negative: the type says which way the
 * money goes. An entry has at least one of the two amounts. No VAT, no invoices.
 *
 * `task_id` links the entry to one of the event's tasks ("Tent huren" → the tent's cost). Tasks
 * are soft-deleted, so deleting a task clears the link in the service; the `set null` only
 * covers a hard delete.
 */
export const budgetEntry = pgTable(
  'budget_entry',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => event.id, { onDelete: 'cascade' }),
    type: budgetEntryTypeEnum('type').notNull(),
    title: text('title').notNull(),
    estimatedCents: integer('estimated_cents'),
    actualCents: integer('actual_cents'),
    notes: text('notes'),
    taskId: uuid('task_id').references(() => task.id, { onDelete: 'set null' }),
    createdByUserId: text('created_by_user_id')
      .notNull()
      .references(() => user.id),
    createdAt,
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    deletedAt: deletedAt(),
  },
  (t) => [
    index('budget_entry_event_id_idx').on(t.eventId),
    index('budget_entry_task_id_idx').on(t.taskId),
    check(
      'budget_entry_has_amount',
      sql`${t.estimatedCents} is not null or ${t.actualCents} is not null`,
    ),
    check(
      'budget_entry_estimated_range',
      sql`${t.estimatedCents} between 0 and ${sql.raw(String(MAX_BUDGET_CENTS))}`,
    ),
    check(
      'budget_entry_actual_range',
      sql`${t.actualCents} between 0 and ${sql.raw(String(MAX_BUDGET_CENTS))}`,
    ),
  ],
);

/** A label on a budget entry. */
export const budgetEntryLabelLink = pgTable(
  'budget_entry_label_link',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    budgetEntryId: uuid('budget_entry_id')
      .notNull()
      .references(() => budgetEntry.id, { onDelete: 'cascade' }),
    labelId: uuid('label_id')
      .notNull()
      .references(() => label.id, { onDelete: 'cascade' }),
    createdAt,
    deletedAt: deletedAt(),
  },
  (t) => [
    uniqueIndex('budget_entry_label_link_entry_label_uidx')
      .on(t.budgetEntryId, t.labelId)
      .where(sql`${t.deletedAt} is null`),
    index('budget_entry_label_link_label_id_idx').on(t.labelId),
  ],
);

export type BudgetEntryRow = typeof budgetEntry.$inferSelect;
