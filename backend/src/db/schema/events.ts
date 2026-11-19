import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  type AnyPgColumn,
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
import { organization, user } from './auth.js';

export const eventStatusEnum = pgEnum('event_status', [
  'draft',
  'published',
  'completed',
  'archived',
]);
/**
 * What kind of event it is: its format, not its occasion ("Christmas Market 2026" is a `market`;
 * the edition link says which market). A fixed list so AI planning can rely on it. Adding a value
 * is a one-line migration; removing or renaming one is not.
 */
export const eventTypeEnum = pgEnum('event_type', [
  'market',
  'festival',
  'party',
  'quiz',
  'meal',
  'sports',
  'camp',
  'trip',
  'other',
]);
export const eventMemberRoleEnum = pgEnum('event_member_role', ['manager']);
/**
 * What the event asks of each volunteer: a number of shifts (`shifts_per_volunteer`), or being
 * there for the whole event (small groups that need everyone all the time).
 */
export const volunteerCommitmentEnum = pgEnum('volunteer_commitment', ['shifts', 'whole_event']);

export type EventStatus = (typeof eventStatusEnum.enumValues)[number];
export type EventType = (typeof eventTypeEnum.enumValues)[number];
export type EventMemberRole = (typeof eventMemberRoleEnum.enumValues)[number];
export type VolunteerCommitment = (typeof volunteerCommitmentEnum.enumValues)[number];

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
    eventType: eventTypeEnum('event_type').notNull(),
    description: text('description'),
    location: text('location'),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    /**
     * Optional build-up before the event and teardown after it. Shifts may fall anywhere from
     * `setup_starts_at` (else `starts_at`) to `teardown_ends_at` (else `ends_at`).
     */
    setupStartsAt: timestamp('setup_starts_at', { withTimezone: true }),
    teardownEndsAt: timestamp('teardown_ends_at', { withTimezone: true }),
    status: eventStatusEnum('status').notNull().default('draft'),
    /**
     * The earlier event this one continues ("Christmas Market 2026" continues "... 2025"). The
     * service checks it is an earlier event of the same organization, which also rules out cycles.
     */
    previousEditionId: uuid('previous_edition_id').references((): AnyPgColumn => event.id, {
      onDelete: 'set null',
    }),
    expectedAttendance: integer('expected_attendance'),
    /** Filled in after the event: the main number to compare editions by. */
    actualAttendance: integer('actual_attendance'),
    /** Lessons learned, written after the event for the next edition. Free text. */
    retrospective: text('retrospective'),
    volunteerCommitment: volunteerCommitmentEnum('volunteer_commitment')
      .notNull()
      .default('shifts'),
    shiftsPerVolunteer: integer('shifts_per_volunteer').notNull().default(1),
    /**
     * The public registration page is /e/<public_slug>. Set the first time registration is
     * opened, and never changed after, so links already shared keep working.
     */
    publicSlug: text('public_slug'),
    registrationOpen: boolean('registration_open').notNull().default(false),
    /** After this moment the registration page is closed; null: open until closed by hand. */
    registrationDeadline: timestamp('registration_deadline', { withTimezone: true }),
    /** When the schedule was first emailed to the volunteers; null: never published. */
    schedulePublishedAt: timestamp('schedule_published_at', { withTimezone: true }),
    createdAt,
    updatedAt,
    deletedAt: deletedAt(),
  },
  (t) => [
    index('event_organization_id_idx').on(t.organizationId),
    check('event_ends_after_starts', sql`${t.endsAt} > ${t.startsAt}`),
    check('event_expected_attendance_non_negative', sql`${t.expectedAttendance} >= 0`),
    check('event_actual_attendance_non_negative', sql`${t.actualAttendance} >= 0`),
    check('event_not_own_previous_edition', sql`${t.previousEditionId} <> ${t.id}`),
    check('event_setup_before_start', sql`${t.setupStartsAt} < ${t.startsAt}`),
    check('event_teardown_after_end', sql`${t.teardownEndsAt} > ${t.endsAt}`),
    check('event_shifts_per_volunteer_positive', sql`${t.shiftsPerVolunteer} >= 1`),
    uniqueIndex('event_public_slug_uidx').on(t.publicSlug),
    // An edition has at most one live successor, so editions form a single chain.
    uniqueIndex('event_previous_edition_uidx')
      .on(t.previousEditionId)
      .where(sql`${t.deletedAt} is null`),
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
    deletedAt: deletedAt(),
  },
  (t) => [
    // One active assignment per user; removed (soft-deleted) assignments stay as history.
    uniqueIndex('event_member_event_user_uidx')
      .on(t.eventId, t.userId)
      .where(sql`${t.deletedAt} is null`),
    index('event_member_user_id_idx').on(t.userId),
  ],
);

export type EventRow = typeof event.$inferSelect;
export type NewEventRow = typeof event.$inferInsert;
export type EventMemberRow = typeof eventMember.$inferSelect;
