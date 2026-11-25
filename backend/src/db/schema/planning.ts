import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
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
    /**
     * Who placed it; null when it wasn't a signed-in user. Accepting Mila's allocation places
     * as the organizer who accepted, with her proposal as the source in the activity log.
     */
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

/**
 * What a planning rule says (docs/info.md §7.7.1 B). Hard rules the solver never breaks:
 * `not_team`, `only_team`, `never_together`, `max_shifts`, `not_before`, `not_after`. Soft rules
 * it weighs: `prefers_team`, `prefer_together`.
 */
export const planningRuleKindEnum = pgEnum('planning_rule_kind', [
  'not_team',
  'only_team',
  'never_together',
  'max_shifts',
  'not_before',
  'not_after',
  'prefers_team',
  'prefer_together',
]);
export type PlanningRuleKind = (typeof planningRuleKindEnum.enumValues)[number];

/** Who said it: the organizer (typed, or told Mila), or the volunteer in their note. */
export const planningRuleSourceEnum = pgEnum('planning_rule_source', [
  'organizer',
  'volunteer_note',
]);
export type PlanningRuleSource = (typeof planningRuleSourceEnum.enumValues)[number];

/**
 * The organizer's knowledge about a volunteer that the allocation must respect. Always about a
 * volunteer (and a second one for the pair rules). Teams are named rather than linked, and
 * times are Brussels clock times, so a rule still means something at the next edition.
 * - `event_id` null: a person rule of the organization, for every event.
 * - `event_id` set: for this event only; copied when its next edition is created.
 */
export const planningRule = pgTable(
  'planning_rule',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id').references(() => event.id, { onDelete: 'cascade' }),
    kind: planningRuleKindEnum('kind').notNull(),
    volunteerId: uuid('volunteer_id')
      .notNull()
      .references(() => volunteer.id, { onDelete: 'cascade' }),
    /** The other person of `never_together` and `prefer_together`. */
    otherVolunteerId: uuid('other_volunteer_id').references(() => volunteer.id, {
      onDelete: 'cascade',
    }),
    /** `not_team`, `only_team`, `prefers_team`: matched to the event's teams ignoring case. */
    teamName: text('team_name'),
    /** `max_shifts`. */
    maxShifts: integer('max_shifts'),
    /** `not_before`, `not_after`: a Brussels clock time, `HH:MM`. */
    time: text('time'),
    source: planningRuleSourceEnum('source').notNull(),
    copiedFromId: uuid('copied_from_id').references((): AnyPgColumn => planningRule.id, {
      onDelete: 'set null',
    }),
    createdByUserId: text('created_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    createdAt,
    updatedAt,
    deletedAt: deletedAt(),
  },
  (t) => [
    index('planning_rule_organization_idx').on(t.organizationId),
    index('planning_rule_event_idx').on(t.eventId),
    index('planning_rule_volunteer_idx').on(t.volunteerId),
    // Each kind has exactly the fields it needs.
    check(
      'planning_rule_fields',
      sql`case ${t.kind}
        when 'not_team' then ${t.teamName} is not null and ${t.otherVolunteerId} is null and ${t.maxShifts} is null and ${t.time} is null
        when 'only_team' then ${t.teamName} is not null and ${t.otherVolunteerId} is null and ${t.maxShifts} is null and ${t.time} is null
        when 'prefers_team' then ${t.teamName} is not null and ${t.otherVolunteerId} is null and ${t.maxShifts} is null and ${t.time} is null
        when 'never_together' then ${t.otherVolunteerId} is not null and ${t.teamName} is null and ${t.maxShifts} is null and ${t.time} is null
        when 'prefer_together' then ${t.otherVolunteerId} is not null and ${t.teamName} is null and ${t.maxShifts} is null and ${t.time} is null
        when 'max_shifts' then ${t.maxShifts} is not null and ${t.maxShifts} >= 0 and ${t.teamName} is null and ${t.otherVolunteerId} is null and ${t.time} is null
        else ${t.time} is not null and ${t.time} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and ${t.teamName} is null and ${t.otherVolunteerId} is null and ${t.maxShifts} is null
      end`,
    ),
    check('planning_rule_other_person', sql`${t.otherVolunteerId} <> ${t.volunteerId}`),
  ],
);

export type TeamRow = typeof team.$inferSelect;
export type ShiftRow = typeof shift.$inferSelect;
export type VolunteerRow = typeof volunteer.$inferSelect;
export type VolunteerApplicationRow = typeof volunteerApplication.$inferSelect;
export type AssignmentRow = typeof assignment.$inferSelect;
export type PlanningRuleRow = typeof planningRule.$inferSelect;
export type NewPlanningRuleRow = typeof planningRule.$inferInsert;
