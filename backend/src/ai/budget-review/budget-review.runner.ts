import { Injectable, Logger } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, asc, eq, inArray, isNotNull } from 'drizzle-orm';
import type { Database } from '../../db/database.js';
import {
  budgetEntry,
  budgetEntryLabelLink,
  event,
  label,
  supplier,
  task,
  type AiRunRow,
  type EventRow,
} from '../../db/schema/index.js';
import { notDeleted } from '../../db/soft-delete.js';
import { todayInBrussels as brusselsDate } from '../../features/profile/profile-rules.js';
import { LiveUpdatesService } from '../../jobs/live-updates.service.js';
import { AiClient } from '../ai-client.service.js';
import { AiSuggestionsRepository } from '../suggestions/ai-suggestions.repository.js';
import { EventGoneError } from '../task-suggestions/task-suggestions.runner.js';
import { buildBudgetReviewContext, type ReviewBudgetLine } from './budget-review.context.js';
import { planBudgetReview, type BudgetPlanState } from './budget-review.plan.js';
import { BUDGET_REVIEW_PROMPT_VERSION, budgetReviewSystem } from './budget-review.prompt.js';
import { budgetReviewOutputSchema } from './budget-review.schema.js';

/** The organizations are Flemish; a per-organization setting comes later. */
const OUTPUT_LANGUAGE = 'nl-BE';

/**
 * Carries out one budget review ("Mila, bekijk mijn begroting"): gathers the event's budget, its
 * previous edition's and its tasks, asks the model, applies the planner's rules and saves the
 * lines and the new insight in one transaction.
 */
@Injectable()
export class BudgetReviewRunner {
  private readonly logger = new Logger(BudgetReviewRunner.name);

  constructor(
    @InjectDrizzle() private readonly db: Database,
    private readonly ai: AiClient,
    private readonly suggestions: AiSuggestionsRepository,
    private readonly live: LiveUpdatesService,
  ) {}

  /** Returns the model and prompt version that produced the result. */
  async run(run: AiRunRow): Promise<{ model: string; promptVersion: string }> {
    const current = await this.findEvent(run.organizationId, run.eventId);
    if (!current) throw new EventGoneError();
    const previous = current.previousEditionId
      ? await this.findEvent(run.organizationId, current.previousEditionId)
      : undefined;

    const [currentLines, previousLines, tasks, earlier] = await Promise.all([
      this.listLines(current.id),
      previous ? this.listLines(previous.id) : Promise.resolve([]),
      this.listTasks(current.id),
      this.suggestions.listForEvent(current.id, ['budget_line']),
    ]);

    const { prompt, refs, records, insight } = buildBudgetReviewContext({
      language: OUTPUT_LANGUAGE,
      today: brusselsDate(new Date()),
      event: {
        id: current.id,
        name: current.name,
        eventType: current.eventType,
        description: current.description,
        location: current.location,
        startDate: brusselsDate(current.startsAt),
        endDate: brusselsDate(current.endsAt),
        expectedAttendance: current.expectedAttendance,
      },
      previousEdition: previous
        ? {
            id: previous.id,
            name: previous.name,
            actualAttendance: previous.actualAttendance,
            expectedAttendance: previous.expectedAttendance,
            retrospective: previous.retrospective,
            lines: previousLines,
          }
        : null,
      currentLines,
      tasks,
      // Open lines are replaced by this review, so only decided ones are "suggested before".
      earlierSuggestions: earlier
        .filter((row) => row.status === 'accepted' || row.status === 'rejected')
        .map((row) => ({ title: row.title, status: row.status })),
      instruction: run.instruction,
    });

    const result = await this.ai.generate({
      run,
      feature: 'budget_review',
      promptVersion: BUDGET_REVIEW_PROMPT_VERSION,
      schema: budgetReviewOutputSchema,
      system: budgetReviewSystem(Boolean(run.instruction)),
      prompt,
    });

    // Plan against the budget as it is now: the organizer may have added lines during the call.
    const freshTitles = (await this.listLines(current.id)).map((line) => line.title);
    const labels = await this.db
      .select({ id: label.id, name: label.name })
      .from(label)
      .where(and(eq(label.eventId, current.id), notDeleted(label)));
    const state: BudgetPlanState = {
      existingTitles: freshTitles,
      labelIdsByName: new Map(labels.map((row) => [row.name.toLowerCase(), row.id])),
      previousEditionName: previous?.name ?? null,
      previousAttendance: previous?.actualAttendance ?? null,
      expectedAttendance: current.expectedAttendance,
    };
    const plan = planBudgetReview(result.output, refs, records, insight, state);
    if (plan.dropped.length > 0) {
      this.logger.log(`Run ${run.id} dropped ${JSON.stringify(plan.dropped)}`);
    }

    await this.db.transaction(async (tx) => {
      const pending = await this.suggestions.listPending(current.id);
      // A new review replaces the lines still open (added or rejected ones stay), so the budget
      // shows one review at a time.
      // The insight is replaced every time too.
      await this.suggestions.dismissStale(
        tx,
        current.id,
        pending
          .filter((row) => row.kind === 'budget_line' || row.kind === 'budget_insight')
          .map((row) => row.dedupKey),
      );
      const owner = { organizationId: run.organizationId, eventId: current.id, runId: run.id };
      // Only the lines the organizer asked for in so many words come back when rejected before;
      // the rest of the review keeps respecting "Niet nodig".
      const asked = plan.lines.filter((line) => line.payload.origin === 'request');
      const rest = plan.lines.filter((line) => line.payload.origin !== 'request');
      await this.suggestions.upsert(
        tx,
        rest.map((line) => ({ ...line, ...owner })),
      );
      await this.suggestions.upsert(
        tx,
        asked.map((line) => ({ ...line, ...owner })),
        { reopenRejected: true },
      );
      // An insight put away ("Verbergen") comes back with the next review.
      await this.suggestions.upsert(tx, [{ ...plan.insight, ...owner }], {
        reopenRejected: true,
      });
      await this.live.publish(tx, { type: 'ai_suggestions', eventId: current.id });
    });

    return { model: result.model, promptVersion: BUDGET_REVIEW_PROMPT_VERSION };
  }

  private async findEvent(organizationId: string, eventId: string): Promise<EventRow | undefined> {
    const [row] = await this.db
      .select()
      .from(event)
      .where(
        and(eq(event.id, eventId), eq(event.organizationId, organizationId), notDeleted(event)),
      )
      .limit(1);
    return row;
  }

  /** The event's budget lines with their label names and supplier, oldest first. */
  private async listLines(eventId: string): Promise<ReviewBudgetLine[]> {
    const rows = await this.db
      .select({ entry: budgetEntry, supplier })
      .from(budgetEntry)
      .leftJoin(supplier, eq(supplier.id, budgetEntry.supplierId))
      .where(and(eq(budgetEntry.eventId, eventId), notDeleted(budgetEntry)))
      .orderBy(asc(budgetEntry.createdAt));
    const ids = rows.map((row) => row.entry.id);
    const links =
      ids.length === 0
        ? []
        : await this.db
            .select({ entryId: budgetEntryLabelLink.budgetEntryId, name: label.name })
            .from(budgetEntryLabelLink)
            .innerJoin(label, eq(label.id, budgetEntryLabelLink.labelId))
            .where(
              and(
                inArray(budgetEntryLabelLink.budgetEntryId, ids),
                notDeleted(budgetEntryLabelLink),
                notDeleted(label),
              ),
            );
    return rows.map(({ entry, supplier: linked }) => ({
      id: entry.id,
      type: entry.type,
      title: entry.title,
      estimatedCents: entry.estimatedCents,
      actualCents: entry.actualCents,
      notes: entry.notes,
      labels: links.filter((link) => link.entryId === entry.id).map((link) => link.name),
      supplier: linked
        ? { id: linked.id, name: linked.name, archived: linked.archivedAt !== null }
        : null,
    }));
  }

  /** The event's tasks, and whether a budget line links to each. */
  private async listTasks(eventId: string) {
    const [tasks, linked] = await Promise.all([
      this.db
        .select({ id: task.id, title: task.title })
        .from(task)
        .where(and(eq(task.eventId, eventId), notDeleted(task)))
        .orderBy(asc(task.createdAt)),
      this.db
        .select({ taskId: budgetEntry.taskId })
        .from(budgetEntry)
        .where(
          and(
            eq(budgetEntry.eventId, eventId),
            notDeleted(budgetEntry),
            isNotNull(budgetEntry.taskId),
          ),
        ),
    ]);
    const withLine = new Set(linked.map((row) => row.taskId));
    return tasks.map((row) => ({ ...row, hasBudgetLine: withLine.has(row.id) }));
  }
}
