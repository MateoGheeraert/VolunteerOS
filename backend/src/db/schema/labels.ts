import { sql } from 'drizzle-orm';
import { pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { deletedAt } from '../soft-delete.js';
import { event } from './events.js';

/** A fixed palette, so every label renders well in light and dark mode. */
export const labelColorEnum = pgEnum('label_color', [
  'gray',
  'red',
  'orange',
  'yellow',
  'green',
  'teal',
  'blue',
  'purple',
]);
export type LabelColor = (typeof labelColorEnum.enumValues)[number];

/**
 * A label of one event ("Bar", "Catering"), shared by everything in the event that can be
 * labelled: tasks (`task_label_link`) and budget entries (`budget_entry_label_link`). Names are
 * unique per event, ignoring case.
 */
export const label = pgTable(
  'label',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => event.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: labelColorEnum('color').notNull().default('gray'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    deletedAt: deletedAt(),
  },
  (t) => [
    uniqueIndex('label_event_name_uidx')
      .on(t.eventId, sql`lower(${t.name})`)
      .where(sql`${t.deletedAt} is null`),
  ],
);

export type LabelRow = typeof label.$inferSelect;
