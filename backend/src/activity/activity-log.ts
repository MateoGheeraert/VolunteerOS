import type { DbExecutor } from '../db/database.js';
import { activityLog } from '../db/schema/index.js';
import { userActor, type Actor } from './actor.js';

export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/** `{ from, to }` for a field whose value may be logged (`from` absent on create), else `null`. */
export type FieldChange = { from?: JsonValue; to?: JsonValue } | null;
export type ActivityChanges = Record<string, FieldChange>;

/**
 * Where a change happened and who made it. An `OrgContext` is one. Changes to a user's own account
 * belong to no organization: use `accountScope(userId)`.
 */
export interface ActivityScope {
  organizationId: string | null;
  actor: Actor;
  /** Where the change came from when the actor didn't type it by hand (see `withSource`). */
  source?: ActivitySource;
}

/**
 * A change a person made through the AI: accepting one of its suggestions (`ai_suggestion`), or
 * confirming tasks it drafted from their own list (`ai_run`, the drafting run).
 */
export interface ActivitySource {
  type: 'ai_suggestion' | 'ai_run';
  id: string;
}

/** The same scope, with every change it records marked as coming from `source`. */
export const withSource = <Scope extends ActivityScope>(
  scope: Scope,
  source: ActivitySource,
): Scope => ({ ...scope, source });

/** A user changing their own account (profile, email, password): no organization. */
export const accountScope = (userId: string): ActivityScope => ({
  organizationId: null,
  actor: userActor(userId),
});

export interface ActivityInput<Row extends { id: string }> {
  /** What happened: `created`, `updated`, `deleted`, or a domain verb such as `archived`. */
  action: string;
  /** The table's name in singular, e.g. `event`, `event_member`. */
  entityType: string;
  /** The row as it is after the change. */
  entity: Row;
  /**
   * What `changes` holds:
   * - a row: the fields that differ from it. If none differ, nothing is logged at all.
   * - `null`: the row is new, so every field it has set.
   * - left out: no field changes, just the action (removed, accepted, ...).
   */
  before?: Row | null;
  /** The event the entity belongs to; leave out for organization-level entities. */
  eventId?: string | null;
  /**
   * Fields whose values may be stored: never personal data or free text. Every other field is
   * stored by name only (`"email": null`), so a forgotten field can't leak a value.
   */
  values?: readonly (keyof Row & string)[];
}

/** Columns that are never interesting as changes: the entry already holds them, or they're noise. */
const SKIPPED_FIELDS = new Set([
  'id',
  'organizationId',
  'eventId',
  'createdAt',
  'updatedAt',
  'deletedAt',
]);

/**
 * Records one change in the activity log. Call it from the service, with the transaction the
 * change runs in, so the entry is committed or rolled back with it:
 *
 *   await recordActivity(tx, org, {
 *     action: 'updated', entityType: 'event', entity: row, before: current,
 *     eventId: row.id, values: EVENT_LOGGED_VALUES,
 *   });
 */
export async function recordActivity<Row extends { id: string }>(
  db: DbExecutor,
  scope: ActivityScope,
  input: ActivityInput<Row>,
): Promise<void> {
  const changes =
    input.before === undefined ? null : diff(input.before, input.entity, input.values);
  if (changes && input.before && Object.keys(changes).length === 0) return;

  const { actor } = scope;
  await db.insert(activityLog).values({
    organizationId: scope.organizationId,
    eventId: input.eventId ?? null,
    actorType: actor.type,
    actorId: actor.type === 'system' ? null : actor.id,
    onBehalfOfUserId: actor.type === 'ai' ? actor.onBehalfOfUserId : null,
    sourceType: scope.source?.type ?? null,
    sourceId: scope.source?.id ?? null,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entity.id,
    changes,
  });
}

/** The fields that differ between the rows (all set fields when `before` is null). */
export function diff<Row extends object>(
  before: Row | null,
  after: Row,
  values: readonly string[] = [],
): ActivityChanges {
  const changes: ActivityChanges = {};
  for (const [field, value] of Object.entries(after)) {
    if (SKIPPED_FIELDS.has(field)) continue;
    const to = toJson(value);
    const from = before ? toJson((before as Record<string, unknown>)[field]) : null;
    if (JSON.stringify(from) === JSON.stringify(to)) continue;
    if (!values.includes(field)) {
      changes[field] = null;
    } else {
      changes[field] = before ? { from, to } : { to };
    }
  }
  return changes;
}

function toJson(value: unknown): JsonValue {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value.toISOString();
  return value as JsonValue;
}
