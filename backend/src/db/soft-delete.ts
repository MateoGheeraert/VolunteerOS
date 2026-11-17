import { isNull } from 'drizzle-orm';
import { timestamp, type PgColumn } from 'drizzle-orm/pg-core';

/**
 * Rows of our tables are never deleted: a deletion sets `deleted_at`. Add this column to every
 * feature table, and filter every read with `notDeleted(table)`. See the README, "Soft deletes".
 */
export const deletedAt = () => timestamp('deleted_at', { withTimezone: true });

/** The `WHERE` condition that hides soft-deleted rows. */
export const notDeleted = (table: { deletedAt: PgColumn }) => isNull(table.deletedAt);
