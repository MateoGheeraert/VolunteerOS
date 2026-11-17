import { sql } from 'drizzle-orm';
import {
  check,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { organization, user } from './auth.js';

export const eventStatusEnum = pgEnum('event_status', [
  'draft',
  'published',
  'completed',
  'archived',
]);
export const eventMemberRoleEnum = pgEnum('event_member_role', ['manager']);

export type EventStatus = (typeof eventStatusEnum.enumValues)[number];
export type EventMemberRole = (typeof eventMemberRoleEnum.enumValues)[number];

const createdAt = timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = timestamp('updated_at', { withTimezone: true })
  .notNull()
  .defaultNow()
  .$onUpdate(() => new Date());

export const event = pgTable(
  'event',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    location: text('location'),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    status: eventStatusEnum('status').notNull().default('draft'),
    createdAt,
    updatedAt,
  },
  (t) => [
    index('event_organization_id_idx').on(t.organizationId),
    check('event_ends_after_starts', sql`${t.endsAt} > ${t.startsAt}`),
  ],
);

export const eventMember = pgTable(
  'event_member',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => event.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: eventMemberRoleEnum('role').notNull().default('manager'),
    createdAt,
  },
  (t) => [
    uniqueIndex('event_member_event_user_uidx').on(t.eventId, t.userId),
    index('event_member_user_id_idx').on(t.userId),
  ],
);

export type EventRow = typeof event.$inferSelect;
export type NewEventRow = typeof event.$inferInsert;
export type EventMemberRow = typeof eventMember.$inferSelect;
