import { Injectable, Logger } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, eq } from 'drizzle-orm';
import type { Database } from '../../db/database.js';
import { event, task, type AiRunRow, type EventRow } from '../../db/schema/index.js';
import { notDeleted } from '../../db/soft-delete.js';
import { todayInBrussels as brusselsDate } from '../../features/profile/profile-rules.js';
import {
  CHEAP_ACTION_MAX_CENTS,
  promotionBudget,
  promotionGuardFor,
  sizeBand,
} from '../../features/promotion/promotion-rules.js';
import { PromotionRepository } from '../../features/promotion/promotion.repository.js';
import { LiveUpdatesService } from '../../jobs/live-updates.service.js';
import { AiClient, AiUnavailableError } from '../ai-client.service.js';
import { AiSuggestionsRepository } from '../suggestions/ai-suggestions.repository.js';
import { EventGoneError } from '../task-suggestions/task-suggestions.runner.js';
import { catalogFor } from './promotion-catalog.js';
import {
  buildPromotionPlanContext,
  type PromotionBudgetLineInput,
} from './promotion-plan.context.js';
import { planPromotionActions } from './promotion-plan.plan.js';
import { PROMOTION_PLAN_PROMPT_VERSION, PROMOTION_PLAN_SYSTEM } from './promotion-plan.prompt.js';
import { promotionPlanOutputSchema } from './promotion-plan.schema.js';

/** The organizations are Flemish; a per-organization setting comes later. */
const OUTPUT_LANGUAGE = 'nl-BE';

/**
 * Carries out one promotion-plan run (docs/info.md §7.11): gathers the event, its Publiek, the
 * catalogue actions that fit and last year's promotion, asks the model, applies the planner's
 * rules, and replaces the pending promo suggestions with the new plan in one transaction.
 */
@Injectable()
export class PromotionPlanRunner {
  private readonly logger = new Logger(PromotionPlanRunner.name);

  constructor(
    @InjectDrizzle() private readonly db: Database,
    private readonly ai: AiClient,
    private readonly promotion: PromotionRepository,
    private readonly suggestions: AiSuggestionsRepository,
    private readonly live: LiveUpdatesService,
  ) {}

  /** Returns the model and prompt version that produced the result. */
  async run(run: AiRunRow): Promise<{ model: string; promptVersion: string }> {
    const current = await this.findEvent(run.organizationId, run.eventId);
    if (!current) throw new EventGoneError();
    const today = brusselsDate(new Date());
    const startDate = brusselsDate(current.startsAt);
    const audience = await this.promotion.findAudience(current.id);
    const guard = promotionGuardFor(current, audience);
    // The request checked this too; the Publiek may have changed while the run was queued.
    if (guard.state !== 'ready' || !audience) {
      throw new AiUnavailableError('failed', `promotion plan not possible: ${guard.state}`);
    }

    const previous = current.previousEditionId
      ? await this.findEvent(run.organizationId, current.previousEditionId)
      : undefined;
    const [promotionTasks, earlier, previousHistory] = await Promise.all([
      this.promotion.listPromotionTasks(current.id),
      this.promotion.listPromoSuggestions(current.id),
      previous ? this.history(previous) : Promise.resolve(null),
    ]);
    const promotionLines = await this.promotion.listPromotionBudgetLines(
      current.id,
      promotionTasks.map((row) => row.id),
    );

    const budget = promotionBudget(audience.promotionBudgetCents, promotionLines);
    const decided = earlier.filter((row) => row.status === 'accepted' || row.status === 'rejected');
    const catalog = catalogFor({
      audiences: audience.audiences,
      sizeBand: sizeBand(current.expectedAttendance),
      lastMinute: guard.lastMinute,
      availableCents: budget.availableCents,
      cheapMaxCents: CHEAP_ACTION_MAX_CENTS,
      excludedKeys: new Set(
        decided
          .map((row) => row.dedupKey.replace(/^promo:/, ''))
          .filter((key) => !key.startsWith('task:')),
      ),
    });

    const { prompt, refs, catalogRefs } = buildPromotionPlanContext({
      language: OUTPUT_LANGUAGE,
      today,
      event: {
        id: current.id,
        name: current.name,
        eventType: current.eventType,
        description: current.description,
        location: current.location,
        startDate,
        endDate: brusselsDate(current.endsAt),
        expectedAttendance: current.expectedAttendance,
      },
      audience: {
        audiences: audience.audiences,
        description: audience.description,
        ageMin: audience.ageMin,
        ageMax: audience.ageMax,
        region: audience.region,
        entryPriceCents: audience.entryPriceCents,
        pitch: audience.pitch,
      },
      sizeBand: sizeBand(current.expectedAttendance),
      lastMinute: guard.lastMinute,
      budget,
      cheapMaxCents: CHEAP_ACTION_MAX_CENTS,
      catalog,
      previousEdition: previousHistory,
      currentPromotionTasks: promotionTasks.map((row) => ({
        id: row.id,
        title: row.title,
        dueDate: row.dueDate,
        status: row.status,
      })),
      earlierSuggestions: decided.map((row) => ({ title: row.title, status: row.status })),
      instruction: run.instruction,
    });

    const result = await this.ai.generate({
      run,
      feature: 'promotion_plan',
      promptVersion: PROMOTION_PLAN_PROMPT_VERSION,
      schema: promotionPlanOutputSchema,
      system: PROMOTION_PLAN_SYSTEM,
      prompt,
    });

    // Plan against the event as it is now: the organizer may have changed it during the call.
    const fresh = (await this.findEvent(run.organizationId, current.id)) ?? current;
    const plan = planPromotionActions(result.output, refs, catalogRefs, {
      eventStartDate: brusselsDate(fresh.startsAt),
      today,
      availableCents: budget.availableCents,
      cheapMaxCents: CHEAP_ACTION_MAX_CENTS,
      existingTaskTitles: await this.listTaskTitles(fresh.id),
      decidedKeys: new Set(decided.map((row) => row.dedupKey)),
    });
    if (plan.dropped.length > 0) {
      this.logger.log(`Run ${run.id} dropped ${JSON.stringify(plan.dropped)}`);
    }

    await this.db.transaction(async (tx) => {
      // A new plan replaces the pending one; accepted and rejected actions stay as they are.
      const pending = (await this.promotion.listPromoSuggestions(fresh.id)).filter(
        (row) => row.status === 'pending',
      );
      await this.suggestions.dismissStale(
        tx,
        fresh.id,
        pending.map((row) => row.dedupKey),
      );
      await this.suggestions.upsert(
        tx,
        plan.suggestions.map((suggestion) => ({
          ...suggestion,
          organizationId: run.organizationId,
          eventId: fresh.id,
          runId: run.id,
        })),
      );
      await this.live.publish(tx, { type: 'ai_suggestions', eventId: fresh.id });
    });

    return { model: result.model, promptVersion: PROMOTION_PLAN_PROMPT_VERSION };
  }

  /** What the previous edition did for promotion, and how it went. */
  private async history(previous: EventRow) {
    const tasks = await this.promotion.listPromotionTasks(previous.id);
    const lines = await this.promotion.listPromotionBudgetLines(
      previous.id,
      tasks.map((row) => row.id),
    );
    const toLine = (line: (typeof lines)[number]): PromotionBudgetLineInput => ({
      title: line.title,
      estimatedCents: line.estimatedCents,
      actualCents: line.actualCents,
      notes: line.notes,
    });
    const taskIds = new Set(tasks.map((row) => row.id));
    return {
      id: previous.id,
      name: previous.name,
      startDate: brusselsDate(previous.startsAt),
      expectedAttendance: previous.expectedAttendance,
      actualAttendance: previous.actualAttendance,
      retrospective: previous.retrospective,
      promotionTasks: tasks.map((row) => ({
        id: row.id,
        title: row.title,
        description: row.description,
        status: row.status,
        dueDate: row.dueDate,
        budgetLines: lines.filter((line) => line.taskId === row.id).map(toLine),
      })),
      otherBudgetLines: lines
        .filter((line) => line.taskId === null || !taskIds.has(line.taskId))
        .map(toLine),
    };
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

  private async listTaskTitles(eventId: string): Promise<string[]> {
    const rows = await this.db
      .select({ title: task.title })
      .from(task)
      .where(and(eq(task.eventId, eventId), notDeleted(task)));
    return rows.map((row) => row.title);
  }
}
