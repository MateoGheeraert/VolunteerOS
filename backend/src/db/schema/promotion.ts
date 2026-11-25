import { sql } from 'drizzle-orm';
import {
  check,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { MAX_BUDGET_CENTS } from './budget.js';
import { event } from './events.js';

/**
 * Who an event is for (docs/info.md §7.11). A fixed list, so Mila's promotion catalogue can match
 * on it. Adding a value is a one-line migration; removing or renaming one is not.
 */
export const promotionAudienceEnum = pgEnum('promotion_audience', [
  'children',
  'teens',
  'young_adults',
  'students',
  'young_families',
  'families',
  'adults',
  'seniors',
  'neighbours',
  'associations',
  'music_lovers',
  'culture_lovers',
  'sporty',
]);
export type PromotionAudience = (typeof promotionAudienceEnum.enumValues)[number];

const createdAt = timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = timestamp('updated_at', { withTimezone: true })
  .notNull()
  .defaultNow()
  .$onUpdate(() => new Date());

/**
 * The event's Publiek: who it is for and how it is promoted. One row per event, created the first
 * time it is saved, and copied to the next edition. Every field is optional: an organizer fills in
 * what they know. Expected attendance, type and location stay on the event.
 *
 * `entry_price_cents`: 0 is free entry, null is not filled in.
 */
export const eventAudience = pgTable(
  'event_audience',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => event.id, { onDelete: 'cascade' }),
    audiences: promotionAudienceEnum('audiences').array().notNull().default([]),
    description: text('description'),
    ageMin: integer('age_min'),
    ageMax: integer('age_max'),
    region: text('region'),
    entryPriceCents: integer('entry_price_cents'),
    /** What makes it worth coming: highlights, acts. */
    pitch: text('pitch'),
    promotionBudgetCents: integer('promotion_budget_cents'),
    createdAt,
    updatedAt,
  },
  (t) => [
    uniqueIndex('event_audience_event_uidx').on(t.eventId),
    check('event_audience_age_min_range', sql`${t.ageMin} between 0 and 120`),
    check('event_audience_age_max_range', sql`${t.ageMax} between 0 and 120`),
    check('event_audience_age_order', sql`${t.ageMin} <= ${t.ageMax}`),
    check(
      'event_audience_entry_price_range',
      sql`${t.entryPriceCents} between 0 and ${sql.raw(String(MAX_BUDGET_CENTS))}`,
    ),
    check(
      'event_audience_promotion_budget_range',
      sql`${t.promotionBudgetCents} between 0 and ${sql.raw(String(MAX_BUDGET_CENTS))}`,
    ),
  ],
);

export type EventAudienceRow = typeof eventAudience.$inferSelect;
export type NewEventAudienceRow = typeof eventAudience.$inferInsert;
