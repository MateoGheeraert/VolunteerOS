import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { deletedAt } from '../soft-delete.js';
import { organization, user } from './auth.js';
import { event } from './events.js';

/**
 * Volunteer planning: an event's teams and their shifts, the volunteers who signed up (or were
 * added by an organizer), and who is assigned to which shift. See docs/info.md §7.4–7.6.
 */

const createdAt = timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = timestamp('updated_at', { withTimezone: true })
  .notNull()
  .defaultNow()
  .$onUpdate(() => new Date());

/** A group of volunteers doing one job at one event ("Bar", "Opbouw"). Names are unique per event. */
export const team = pgTable(
  'team',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => event.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    /** Pre-fills the meeting point of the team's new shifts; each shift keeps its own. */
    defaultMeetingPoint: text('default_meeting_point'),
    createdAt,
    updatedAt,
    deletedAt: deletedAt(),
  },
  (t) => [
    uniqueIndex('team_event_name_uidx')
      .on(t.eventId, sql`lower(${t.name})`)
      .where(sql`${t.deletedAt} is null`),
  ],
);

/**
 * A time slot of one team that needs `capacity` volunteers. Capacity is a target, not a hard
 * limit: an organizer may assign more people after confirming a warning.
 */
export const shift = pgTable(
  'shift',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => event.id, { onDelete: 'cascade' }),
    teamId: uuid('team_id')
      .notNull()
      .references(() => team.id, { onDelete: 'cascade' }),
    meetingPoint: text('meeting_point'),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    capacity: integer('capacity').notNull(),
    createdAt,
    updatedAt,
    deletedAt: deletedAt(),
  },
  (t) => [
    index('shift_event_id_idx').on(t.eventId),
    index('shift_team_id_idx').on(t.teamId),
    check('shift_ends_after_starts', sql`${t.endsAt} > ${t.startsAt}`),
    check('shift_capacity_positive', sql`${t.capacity} >= 1`),
  ],
);

/**
 * A person who helps an organization, with or without an account. Kept per organization, so the
 * same person signing up for the next edition is the same volunteer. Email is optional for people
 * an organizer adds by hand, and unique (ignoring case) when present.
 */
export const volunteer = pgTable(
  'volunteer',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    email: text('email'),
    phone: text('phone'),
    createdAt,
    updatedAt,
    deletedAt: deletedAt(),
  },
  (t) => [
    uniqueIndex('volunteer_organization_email_uidx')
      .on(t.organizationId, sql`lower(${t.email})`)
      .where(sql`${t.email} is not null and ${t.deletedAt} is null`),
  ],
);

export const applicationSourceEnum = pgEnum('volunteer_application_source', ['public', 'manual']);
export type ApplicationSource = (typeof applicationSourceEnum.enumValues)[number];

/** One shift as it was emailed to a volunteer: what the next publish compares against. */
export interface ScheduleEntry {
  shiftId: string;
  teamName: string;
  startsAt: string;
  endsAt: string;
  meetingPoint: string | null;
}

/**
 * A volunteer's sign-up for one event: which shifts they can do, which team they'd like, and
 * anything they want to add. One per volunteer and event; signing up again updates it.
 */
export const volunteerApplication = pgTable(
  'volunteer_application',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => event.id, { onDelete: 'cascade' }),
    volunteerId: uuid('volunteer_id')
      .notNull()
      .references(() => volunteer.id, { onDelete: 'cascade' }),
    source: applicationSourceEnum('source').notNull(),
    /** The shifts the volunteer says they can do. Shifts deleted later are ignored on read. */
    availableShiftIds: uuid('available_shift_ids')
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    /** Available for the whole event: every shift counts as available. */
    wholeEvent: boolean('whole_event').notNull().default(false),
    preferredTeamId: uuid('preferred_team_id').references(() => team.id, { onDelete: 'set null' }),
    notes: text('notes'),
    /** When the volunteer agreed to the privacy notice; null for people added by an organizer. */
    consentedAt: timestamp('consented_at', { withTimezone: true }),
    /**
     * The confirmed shifts last emailed to the volunteer (empty: told they aren't needed); null
     * when nothing was ever sent. Publishing again only emails volunteers whose schedule differs.
     */
    notifiedSchedule: jsonb('notified_schedule').$type<ScheduleEntry[]>(),
    createdAt,
    updatedAt,
    deletedAt: deletedAt(),
  },
  (t) => [
    uniqueIndex('volunteer_application_event_volunteer_uidx')
      .on(t.eventId, t.volunteerId)
      .where(sql`${t.deletedAt} is null`),
    index('volunteer_application_volunteer_id_idx').on(t.volunteerId),
  ],
);

export const assignmentStatusEnum = pgEnum('assignment_status', ['proposed', 'confirmed']);
export type AssignmentStatus = (typeof assignmentStatusEnum.enumValues)[number];

/**
 * A volunteer placed on a shift. `proposed` until an organizer confirms it; only confirmed
 * assignments are emailed when the schedule is published. Unassigning soft-deletes the row.
 */
export const assignment = pgTable(
  'assignment',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => volunteerApplication.id, { onDelete: 'cascade' }),
    shiftId: uuid('shift_id')
      .notNull()
      .references(() => shift.id, { onDelete: 'cascade' }),
    status: assignmentStatusEnum('status').notNull().default('proposed'),
    /** Who placed it; null when it wasn't a signed-in user (later: the AI agent). */
    assignedByUserId: text('assigned_by_user_id').references(() => user.id),
    createdAt,
    updatedAt,
    deletedAt: deletedAt(),
  },
  (t) => [
    uniqueIndex('assignment_application_shift_uidx')
      .on(t.applicationId, t.shiftId)
      .where(sql`${t.deletedAt} is null`),
    index('assignment_shift_id_idx').on(t.shiftId),
  ],
);

export type TeamRow = typeof team.$inferSelect;
export type ShiftRow = typeof shift.$inferSelect;
export type VolunteerRow = typeof volunteer.$inferSelect;
export type VolunteerApplicationRow = typeof volunteerApplication.$inferSelect;
export type AssignmentRow = typeof assignment.$inferSelect;
