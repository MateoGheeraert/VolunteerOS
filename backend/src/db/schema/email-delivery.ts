import { index, integer, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { organization } from './auth.js';
import { event } from './events.js';

export const emailDeliveryStatusEnum = pgEnum('email_delivery_status', [
  'pending',
  'sent',
  'failed',
]);
export type EmailDeliveryStatus = (typeof emailDeliveryStatusEnum.enumValues)[number];

/**
 * One row per email we intend to send, written before the provider is called (see src/email).
 * `idempotency_key` is unique: the same key never sends twice, and it is also passed to the
 * provider so a retry after a lost response is deduplicated there too.
 *
 * An append-only log, so no `deleted_at`: rows are never edited by users or removed.
 * `template` is text, not an enum, so adding an email never needs a migration.
 * `organization_id` and `event_id` are optional: a password reset belongs to neither.
 */
export const emailDelivery = pgTable(
  'email_delivery',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: text('organization_id').references(() => organization.id),
    eventId: uuid('event_id').references(() => event.id),
    recipient: text('recipient').notNull(),
    template: text('template').notNull(),
    subject: text('subject').notNull(),
    status: emailDeliveryStatusEnum('status').notNull().default('pending'),
    idempotencyKey: text('idempotency_key').notNull().unique(),
    providerMessageId: text('provider_message_id'),
    /** Provider calls made so far, across every send of this key. */
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
  },
  (t) => [
    index('email_delivery_created_idx').on(t.createdAt.desc()),
    index('email_delivery_organization_created_idx').on(t.organizationId, t.createdAt.desc()),
  ],
);

export type EmailDeliveryRow = typeof emailDelivery.$inferSelect;
