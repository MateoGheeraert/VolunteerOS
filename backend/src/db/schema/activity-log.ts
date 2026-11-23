import { sql } from 'drizzle-orm';
import { check, index, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { ActivityChanges } from '../../activity/activity-log.js';
import { organization } from './auth.js';
import { event } from './events.js';

export const activityActorTypeEnum = pgEnum('activity_actor_type', [
  'user',
  'volunteer',
  'system',
  'ai',
]);
export type ActivityActorType = (typeof activityActorTypeEnum.enumValues)[number];

/**
 * Append-only history of every change: who did what to which record. Written in the same
 * transaction as the change (see src/activity). Holds IDs and field names, and values only of
 * fields an entity marks as non-personal, never copies of personal data.
 *
 * `organization_id` and `event_id` are stored even though they could be derived from the entity,
 * because the entity may be gone (Better Auth hard-deletes members) and because an event's history
 * spans many entity types. Their foreign keys don't cascade: the history outlives what it describes.
 *
 * Changes to a user's own account belong to no organization: `organization_id` is null and
 * `entity_type` is `user`. Organization queries filter on `organization_id`, so they never see them.
 */
export const activityLog = pgTable(
  'activity_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Null for account-level changes (a user's own profile, email or password). */
    organizationId: text('organization_id').references(() => organization.id),
    eventId: uuid('event_id').references(() => event.id),
    actorType: activityActorTypeEnum('actor_type').notNull(),
    // No foreign keys: actors can be users, volunteers or AI agents, and outlive their accounts.
    actorId: text('actor_id'),
    /** The user whose command an AI agent was carrying out. */
    onBehalfOfUserId: text('on_behalf_of_user_id'),
    /**
     * Where a person's change came from, when not typed by hand: `ai_suggestion` and its id when
     * they accepted an AI suggestion. The actor is still the person who decided.
     */
    sourceType: text('source_type'),
    sourceId: text('source_id'),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    changes: jsonb('changes').$type<ActivityChanges>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('activity_log_organization_created_idx').on(t.organizationId, t.createdAt.desc()),
    index('activity_log_event_created_idx').on(t.eventId, t.createdAt.desc()),
    index('activity_log_entity_idx').on(t.entityType, t.entityId),
    check('activity_log_actor_id', sql`${t.actorType} = 'system' or ${t.actorId} is not null`),
    check(
      'activity_log_on_behalf_of_ai',
      sql`${t.onBehalfOfUserId} is null or ${t.actorType} = 'ai'`,
    ),
    check('activity_log_source_pair', sql`(${t.sourceType} is null) = (${t.sourceId} is null)`),
  ],
);

export type ActivityLogRow = typeof activityLog.$inferSelect;
