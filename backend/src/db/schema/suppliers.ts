import { sql } from 'drizzle-orm';
import { index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { deletedAt } from '../soft-delete.js';
import { organization, user } from './auth.js';

/**
 * What a supplier delivers. A fixed list so the directory filters cleanly; `other` plus the notes
 * cover the rest. Adding a value is a one-line migration; removing or renaming one is not.
 */
export const supplierCategoryEnum = pgEnum('supplier_category', [
  'drinks',
  'food',
  'sound_and_light',
  'tents_and_furniture',
  'sanitation',
  'security',
  'printing',
  'transport',
  'rental',
  'other',
]);
export type SupplierCategory = (typeof supplierCategoryEnum.enumValues)[number];

/**
 * A supplier of the organization (the brewery, the sound company), reused across events. It is
 * linked to an event only through the budget: `budget_entry.supplier_id`.
 *
 * A supplier is never deleted: it is archived (`archived_at`), which hides it from the directory
 * and the pickers but keeps it on the entries that reference it. `deleted_at` exists like on every
 * feature table, but no route sets it. Names are unique per organization ignoring case, archived
 * suppliers included, so the history never splits over two rows of the same supplier.
 */
export const supplier = pgTable(
  'supplier',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    category: supplierCategoryEnum('category').notNull(),
    contactName: text('contact_name'),
    email: text('email'),
    phone: text('phone'),
    website: text('website'),
    notes: text('notes'),
    createdByUserId: text('created_by_user_id')
      .notNull()
      .references(() => user.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    deletedAt: deletedAt(),
  },
  (t) => [
    uniqueIndex('supplier_organization_name_uidx')
      .on(t.organizationId, sql`lower(${t.name})`)
      .where(sql`${t.deletedAt} is null`),
    index('supplier_organization_id_idx').on(t.organizationId),
  ],
);

export type SupplierRow = typeof supplier.$inferSelect;
