import { sql } from 'drizzle-orm';
import { check, date, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { user } from './auth.js';

/**
 * Personal details of a user, one row per user (created on the first save). Kept out of Better
 * Auth's `user` table on purpose: additional fields there travel in every session payload.
 *
 * Every field is optional. The address is all or nothing (only `box` may be empty), so a half
 * address never reaches AI suggestions that rank people by proximity.
 *
 * No soft delete: clearing a field sets it to null, and erasing an account (GDPR) removes the row
 * with the user.
 */
export const userProfile = pgTable(
  'user_profile',
  {
    userId: text('user_id')
      .primaryKey()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** E.164, e.g. +32470123456. */
    phone: text('phone'),
    street: text('street'),
    houseNumber: text('house_number'),
    box: text('box'),
    postalCode: text('postal_code'),
    city: text('city'),
    /** ISO 3166-1 alpha-2, e.g. BE. */
    country: text('country'),
    birthDate: date('birth_date', { mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    check(
      'user_profile_address_complete',
      sql`(${t.street} is null and ${t.houseNumber} is null and ${t.box} is null
        and ${t.postalCode} is null and ${t.city} is null and ${t.country} is null)
      or (${t.street} is not null and ${t.houseNumber} is not null
        and ${t.postalCode} is not null and ${t.city} is not null and ${t.country} is not null)`,
    ),
  ],
);

export type UserProfileRow = typeof userProfile.$inferSelect;
