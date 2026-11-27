import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { Citation, QuestionAnswer } from '../../ai/ai.types.js';
import { organization, user } from './auth.js';
import { event } from './events.js';

/**
 * The AI agent's tables. See docs/info.md "AI agent" for the rules:
 * - `ai_run`: one feature run (on demand, or started by a trigger), done by a background job.
 * - `ai_suggestion`: what a run proposes. The agent never changes domain data itself: a person
 *   accepts a suggestion, and the normal service makes the change.
 * - `ai_memory`: the agent's own notes, for facts that have no field on the event.
 * - `ai_usage`: one row per model call, for cost tracking and the monthly cap.
 */

const createdAt = timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = timestamp('updated_at', { withTimezone: true })
  .notNull()
  .defaultNow()
  .$onUpdate(() => new Date());

/**
 * What an AI run does. One value per feature.
 *
 * - `task_drafting`: turning an organizer's own list into tasks, while they wait.
 * - `promotion_plan`: a promotion plan for the event's audience (docs/info.md §7.11).
 * - `shift_suggestions`: teams and shifts for the planning (docs/info.md §7.7.1 A).
 * - `rule_drafting`: the organizer's text about people as planning rules, while they wait.
 * - `allocation`: reading the volunteers' notes, then the solver's proposal of who goes where.
 * - `budget_review`: "Mila, bekijk mijn begroting": missing budget lines and an insight.
 */
export const aiFeatureEnum = pgEnum('ai_feature', [
  'task_suggestions',
  'task_drafting',
  'promotion_plan',
  'shift_suggestions',
  'rule_drafting',
  'allocation',
  'budget_review',
]);
/** What started a run: a person asking, or something that happened. */
export const aiTriggerEnum = pgEnum('ai_trigger', [
  'on_demand',
  'event_created',
  'question_answered',
]);
export const aiRunStatusEnum = pgEnum('ai_run_status', [
  'queued',
  'running',
  'succeeded',
  'failed',
]);

/**
 * `budget_line`: a line to add to the budget. `budget_insight`: what the budget's numbers mean;
 * nothing to accept, replaced by each run.
 */
export const aiSuggestionKindEnum = pgEnum('ai_suggestion_kind', [
  'task_suggestion',
  'question',
  'update_event',
  'promo_action',
  // The planning page (docs/info.md §7.7.1).
  'team_suggestion',
  'shift_change',
  'planning_rule',
  'allocation',
  'budget_line',
  'budget_insight',
]);
/**
 * `dismissed_stale`: closed by the agent because its cause went away (the task was created by
 * hand, the field was filled in). It may come back if the cause does.
 */
export const aiSuggestionStatusEnum = pgEnum('ai_suggestion_status', [
  'pending',
  'accepted',
  'rejected',
  'dismissed_stale',
]);

export const aiMemorySourceEnum = pgEnum('ai_memory_source', ['organizer_answer', 'inference']);
export const aiMemoryConfidenceEnum = pgEnum('ai_memory_confidence', ['low', 'medium', 'high']);

export const aiUsageOutcomeEnum = pgEnum('ai_usage_outcome', [
  'success',
  'invalid_output',
  'error',
  'timeout',
  'cap_reached',
]);

export type AiFeature = (typeof aiFeatureEnum.enumValues)[number];
export type AiTrigger = (typeof aiTriggerEnum.enumValues)[number];
export type AiRunStatus = (typeof aiRunStatusEnum.enumValues)[number];
export type AiSuggestionKind = (typeof aiSuggestionKindEnum.enumValues)[number];
export type AiSuggestionStatus = (typeof aiSuggestionStatusEnum.enumValues)[number];
export type AiMemorySource = (typeof aiMemorySourceEnum.enumValues)[number];
export type AiMemoryConfidence = (typeof aiMemoryConfidenceEnum.enumValues)[number];
export type AiUsageOutcome = (typeof aiUsageOutcomeEnum.enumValues)[number];

export const aiRun = pgTable(
  'ai_run',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id')
      .notNull()
      .references(() => event.id, { onDelete: 'cascade' }),
    feature: aiFeatureEnum('feature').notNull(),
    trigger: aiTriggerEnum('trigger').notNull(),
    status: aiRunStatusEnum('status').notNull().default('queued'),
    /** Who asked, or whose action triggered the run. */
    requestedByUserId: text('requested_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    /** The prompt version and model that produced the result; set when the run succeeds. */
    promptVersion: text('prompt_version'),
    model: text('model'),
    /** What the organizer asked of this run ("meer Instagram, geen drukwerk"), if anything. */
    instruction: text('instruction'),
    /** Why a run failed, for debugging. Never shown to organizers. */
    error: text('error'),
    createdAt,
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [
    index('ai_run_event_created_idx').on(t.eventId, t.createdAt.desc()),
    // An event has at most one unfinished run per feature, also when two requests race.
    uniqueIndex('ai_run_unfinished_uidx')
      .on(t.eventId, t.feature)
      .where(sql`${t.status} in ('queued', 'running')`),
  ],
);

export const aiSuggestion = pgTable(
  'ai_suggestion',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id')
      .notNull()
      .references(() => event.id, { onDelete: 'cascade' }),
    runId: uuid('run_id')
      .notNull()
      .references(() => aiRun.id, { onDelete: 'cascade' }),
    kind: aiSuggestionKindEnum('kind').notNull(),
    /**
     * What the suggestion is about (`task:tent huren`, `field:location`). One row per key and
     * event, ever: a rejected suggestion is never made again.
     */
    dedupKey: text('dedup_key').notNull(),
    status: aiSuggestionStatusEnum('status').notNull().default('pending'),
    /** The card's heading: the task title, the question, or the proposed change. */
    title: text('title').notNull(),
    /** Why the agent suggests it, in the organization's language. */
    explanation: text('explanation').notNull(),
    /** The kind's own data (see src/ai/ai.types.ts), validated with its Zod schema. */
    payload: jsonb('payload').notNull(),
    citations: jsonb('citations').$type<Citation[]>().notNull().default([]),
    answer: jsonb('answer').$type<QuestionAnswer>(),
    seenAt: timestamp('seen_at', { withTimezone: true }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    resolvedByUserId: text('resolved_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    createdAt,
    updatedAt,
  },
  (t) => [
    uniqueIndex('ai_suggestion_event_dedup_uidx').on(t.eventId, t.dedupKey),
    index('ai_suggestion_event_status_idx').on(t.eventId, t.status),
  ],
);

export const aiMemory = pgTable(
  'ai_memory',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    /** The event the fact is about; null for facts about the organization. */
    eventId: uuid('event_id').references(() => event.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    source: aiMemorySourceEnum('source').notNull(),
    confidence: aiMemoryConfidenceEnum('confidence').notNull(),
    /** The records the fact was derived from. */
    citations: jsonb('citations').$type<Citation[]>().notNull().default([]),
    /** The run that wrote it. */
    runId: uuid('run_id').references(() => aiRun.id, { onDelete: 'set null' }),
    /** The question card whose answer it holds. */
    suggestionId: uuid('suggestion_id').references(() => aiSuggestion.id, {
      onDelete: 'set null',
    }),
    /** Copied from the previous edition's memory when this event was created. */
    copiedFromId: uuid('copied_from_id').references((): AnyPgColumn => aiMemory.id, {
      onDelete: 'set null',
    }),
    /** A newer memory that replaces this one; superseded memories are no longer sent. */
    supersededById: uuid('superseded_by_id').references((): AnyPgColumn => aiMemory.id, {
      onDelete: 'set null',
    }),
    createdAt,
  },
  (t) => [
    index('ai_memory_organization_idx').on(t.organizationId),
    index('ai_memory_event_idx').on(t.eventId),
  ],
);

export const aiUsage = pgTable(
  'ai_usage',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    runId: uuid('run_id').references(() => aiRun.id, { onDelete: 'set null' }),
    feature: aiFeatureEnum('feature').notNull(),
    trigger: aiTriggerEnum('trigger').notNull(),
    /** `provider:model`, e.g. `openai:gpt-5.4-mini`. */
    model: text('model').notNull(),
    promptVersion: text('prompt_version').notNull(),
    /** 0 for the primary model, 1 for the fallback. */
    attempt: integer('attempt').notNull().default(0),
    outcome: aiUsageOutcomeEnum('outcome').notNull(),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    /** In thousandths of a euro cent, so cheap calls don't round to zero. */
    costMillicents: integer('cost_millicents').notNull().default(0),
    durationMs: integer('duration_ms').notNull().default(0),
    error: text('error'),
    createdAt,
  },
  (t) => [
    index('ai_usage_organization_created_idx').on(t.organizationId, t.createdAt),
    check('ai_usage_attempt_non_negative', sql`${t.attempt} >= 0`),
  ],
);

export type AiRunRow = typeof aiRun.$inferSelect;
export type AiSuggestionRow = typeof aiSuggestion.$inferSelect;
export type NewAiSuggestionRow = typeof aiSuggestion.$inferInsert;
export type AiMemoryRow = typeof aiMemory.$inferSelect;
export type NewAiMemoryRow = typeof aiMemory.$inferInsert;
export type AiUsageRow = typeof aiUsage.$inferSelect;

/**
 * A Mila hint on the event overview that one user put away (docs/info.md §7.2). UI state, not
 * domain data: one row per user, event and hint, hard-deleted with either. The hint comes back
 * when its situation changes, i.e. when the overview computes a different `fingerprint`.
 */
export const milaHintDismissal = pgTable(
  'mila_hint_dismissal',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id')
      .notNull()
      .references(() => event.id, { onDelete: 'cascade' }),
    hintKey: text('hint_key').notNull(),
    fingerprint: text('fingerprint').notNull(),
    dismissedAt: timestamp('dismissed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.eventId, t.hintKey] })],
);

export type MilaHintDismissalRow = typeof milaHintDismissal.$inferSelect;
