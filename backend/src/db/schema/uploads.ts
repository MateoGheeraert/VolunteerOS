import { sql } from 'drizzle-orm';
import { bigint, index, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { deletedAt } from '../soft-delete.js';
import { organization, user } from './auth.js';
import { budgetEntry } from './budget.js';
import { event } from './events.js';
import { task } from './tasks.js';

/**
 * `pending`: the row exists and the browser has an upload URL, but the file isn't confirmed yet.
 * `ready`: the file is in storage and matched what was announced.
 */
export const uploadStatusEnum = pgEnum('upload_status', ['pending', 'ready']);
export type UploadStatus = (typeof uploadStatusEnum.enumValues)[number];

/**
 * A file in object storage (Cloudflare R2). The row holds the facts about the file; what it is
 * attached to lives in one link table per owner type (`event_upload`, `task_upload`,
 * `budget_entry_upload`), each with
 * `upload_id` as primary key, so a file has exactly one owner.
 *
 * Deleting a file soft-deletes the row. The storage object is removed later by the daily cleanup
 * job, which sets `purged_at`; the row itself is never removed.
 */
export const upload = pgTable(
  'upload',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    /** The object key in the bucket. Never contains the file name. */
    storageKey: text('storage_key').notNull().unique(),
    /** The original file name, shown in the app and used when downloading. */
    name: text('name').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    status: uploadStatusEnum('status').notNull().default('pending'),
    uploadedByUserId: text('uploaded_by_user_id')
      .notNull()
      .references(() => user.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    deletedAt: deletedAt(),
    /** When the cleanup job removed the object from storage. */
    purgedAt: timestamp('purged_at', { withTimezone: true }),
  },
  (t) => [
    // Storage used per organization: sums live, ready files.
    index('upload_organization_live_idx')
      .on(t.organizationId)
      .where(sql`${t.deletedAt} is null`),
    // The cleanup job's work: deleted or abandoned files whose object is still in storage.
    index('upload_unpurged_idx')
      .on(t.deletedAt, t.createdAt)
      .where(sql`${t.purgedAt} is null`),
  ],
);

/** A file attached to an event itself. */
export const eventUpload = pgTable(
  'event_upload',
  {
    uploadId: uuid('upload_id')
      .primaryKey()
      .references(() => upload.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id')
      .notNull()
      .references(() => event.id, { onDelete: 'cascade' }),
  },
  (t) => [index('event_upload_event_id_idx').on(t.eventId)],
);

/** A file attached to a task. */
export const taskUpload = pgTable(
  'task_upload',
  {
    uploadId: uuid('upload_id')
      .primaryKey()
      .references(() => upload.id, { onDelete: 'cascade' }),
    taskId: uuid('task_id')
      .notNull()
      .references(() => task.id, { onDelete: 'cascade' }),
  },
  (t) => [index('task_upload_task_id_idx').on(t.taskId)],
);

/** A file attached to a budget entry, e.g. its invoice or receipt. */
export const budgetEntryUpload = pgTable(
  'budget_entry_upload',
  {
    uploadId: uuid('upload_id')
      .primaryKey()
      .references(() => upload.id, { onDelete: 'cascade' }),
    budgetEntryId: uuid('budget_entry_id')
      .notNull()
      .references(() => budgetEntry.id, { onDelete: 'cascade' }),
  },
  (t) => [index('budget_entry_upload_budget_entry_id_idx').on(t.budgetEntryId)],
);

export type UploadRow = typeof upload.$inferSelect;
