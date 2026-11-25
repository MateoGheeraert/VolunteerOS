import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';
import { dateTimeOutput } from '../../common/schemas.js';
import {
  milaHintDismissal,
  taskPriorityEnum,
  taskStatusEnum,
  volunteerCommitmentEnum,
} from '../../db/schema/index.js';
import { HINT_CARDS, HINT_KEYS } from './overview-rules.js';

/**
 * The event overview (docs/info.md §7.2): one card per module with its stats and status color,
 * and Mila's hints. Everything is decided here, so the page only draws it. Amounts are cents.
 */

const cardStatus = z.enum(['ok', 'warn', 'bad', 'neutral']);
const count = () => z.number().int().min(0);
const amounts = z.object({ estimated: z.number().int(), actual: z.number().int() });

export const overviewSchema = z
  .object({
    phase: z.enum(['before', 'during', 'after']),
    /** Whole days until the start; 0 once it started. */
    daysToStart: count(),
    countdown: z.object({
      createdAt: dateTimeOutput,
      startsAt: dateTimeOutput,
      endsAt: dateTimeOutput,
      /** Upcoming dates worth knowing, soonest first, at most two. */
      milestones: z.array(
        z.object({ kind: z.enum(['registration_closes', 'setup_starts']), at: dateTimeOutput }),
      ),
    }),
    wrapUp: z.object({
      expectedAttendance: z.number().int().nullable(),
      actualAttendance: z.number().int().nullable(),
      openTasks: count(),
      hasRetrospective: z.boolean(),
    }),
    tasks: z.object({
      status: cardStatus,
      total: count(),
      done: count(),
      inProgress: count(),
      todo: count(),
      unassigned: count(),
      overdue: count(),
      /** Members asking to take a task; managers only, else 0. */
      pendingRequests: count(),
      /** What to look at first, among the tasks the caller may see. */
      next: z.array(
        z.object({
          id: z.uuid(),
          title: z.string(),
          status: z.enum(taskStatusEnum.enumValues),
          priority: z.enum(taskPriorityEnum.enumValues),
          dueDate: z.iso.date().nullable(),
          overdue: z.boolean(),
          assigneeName: z.string().nullable(),
        }),
      ),
    }),
    planning: z.object({
      status: cardStatus,
      volunteerCommitment: z.enum(volunteerCommitmentEnum.enumValues),
      shiftCount: count(),
      positions: count(),
      filled: count(),
      confirmed: count(),
      applications: count(),
      /** Volunteers with at least one shift, and those still without. */
      assignedVolunteers: count(),
      unassignedVolunteers: count(),
      schedulePublishedAt: dateTimeOutput.nullable(),
      teams: z.array(
        z.object({
          id: z.uuid(),
          name: z.string(),
          positions: count(),
          filled: count(),
          confirmed: count(),
        }),
      ),
    }),
    budget: z.object({
      status: cardStatus,
      entryCount: count(),
      income: amounts,
      expense: amounts,
      result: amounts,
      supplierCount: count(),
    }),
    /** The Promotie tasks and Mila's plan (docs/info.md §7.11). */
    promotion: z.object({
      status: cardStatus,
      /** Promotie tasks the caller may see: not done yet, and overdue among them. */
      open: count(),
      overdue: count(),
      done: count(),
      /** The first unfinished one: overdue or soonest due first. */
      next: z
        .object({
          id: z.uuid(),
          title: z.string(),
          dueDate: z.iso.date().nullable(),
          overdue: z.boolean(),
        })
        .nullable(),
      /** Mila ever proposed a plan for this event; without one the card offers to make it. */
      hasPlan: z.boolean(),
      /** Her actions waiting for a decision. */
      pendingActions: count(),
    }),
    mila: z.object({
      /** Mila is available (an API key is configured) and the caller manages the event. */
      enabled: z.boolean(),
      /** Mila is looking for missing tasks right now. */
      findingTasks: z.boolean(),
      /** Her questions and proposed event changes waiting for an answer. */
      openQuestions: count(),
      /** Her task suggestions waiting for a decision. */
      pendingTaskSuggestions: count(),
      /** Mila is suggesting teams and shifts or dividing volunteers right now. */
      planningBusy: z.boolean(),
      /** Her planning cards (teams, shifts, rules, an allocation) waiting for a decision. */
      pendingPlanningSuggestions: count(),
      // A union rather than `.nullable()`: the OpenAPI client drops `nullable` from an enum.
      statusSuggestion: z.union([z.enum(['publish', 'complete']), z.null()]),
      hints: z.array(
        z.object({
          key: z.enum(HINT_KEYS),
          card: z.enum(HINT_CARDS),
          fingerprint: z.string(),
          highlighted: z.boolean(),
        }),
      ),
    }),
  })
  .meta({ id: 'EventOverview' });
export type OverviewDto = z.infer<typeof overviewSchema>;

export const dismissHintSchema = createInsertSchema(milaHintDismissal, {
  hintKey: z.enum(HINT_KEYS),
  fingerprint: (schema) => schema.min(1).max(200),
})
  .pick({ hintKey: true, fingerprint: true })
  .meta({ id: 'DismissMilaHint' });
export type DismissHintInput = z.infer<typeof dismissHintSchema>;
