import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { recordActivity, withSource } from '../../activity/activity-log.js';
import type { EventAccess } from '../../authz/event-access.service.js';
import type { OrgContext } from '../../authz/org-context.js';
import type { Database, Transaction } from '../../db/database.js';
import type { AiSuggestionRow } from '../../db/schema/index.js';
import { BudgetService } from '../../features/budget/budget.service.js';
import { isReadOnly } from '../../features/events/event-status.js';
import { promotionGuardFor } from '../../features/promotion/promotion-rules.js';
import { PromotionRepository } from '../../features/promotion/promotion.repository.js';
import { TasksService } from '../../features/tasks/tasks.service.js';
import { LiveUpdatesService } from '../../jobs/live-updates.service.js';
import type { AiRunDto } from '../ai.schemas.js';
import { promoActionPayloadSchema } from '../ai.types.js';
import { AiRunsService } from '../runs/ai-runs.service.js';
import { AiSuggestionsRepository } from '../suggestions/ai-suggestions.repository.js';
import type {
  AcceptPromoActionsInput,
  RequestPromotionPlanInput,
} from './promotion-plan.schemas.js';

/** Suggestion fields the activity log keeps the values of: none are personal. */
const SUGGESTION_LOGGED_VALUES = ['kind', 'status'] as const;

/**
 * Asking Mila for a promotion plan, and accepting her actions (docs/info.md §7.11). Accepting
 * runs the normal services as the organizer: the task (always labelled Promotie) and, when asked,
 * an estimated expense linked to it, with the suggestion as their source in the activity log.
 *
 * Routes have already authorized the event for 'manage'.
 */
@Injectable()
export class PromotionPlanService {
  constructor(
    @InjectDrizzle() private readonly db: Database,
    private readonly runs: AiRunsService,
    private readonly promotion: PromotionRepository,
    private readonly suggestions: AiSuggestionsRepository,
    private readonly tasks: TasksService,
    private readonly budget: BudgetService,
    private readonly live: LiveUpdatesService,
  ) {}

  /** Queues a plan run, when the Publiek and the date allow one; 409 otherwise. */
  async request(
    org: OrgContext,
    access: EventAccess,
    input: RequestPromotionPlanInput,
  ): Promise<AiRunDto> {
    const { event } = access;
    const audience = await this.promotion.findAudience(event.id);
    const guard = promotionGuardFor(event, audience);
    if (guard.state !== 'ready') {
      throw new ConflictException(`promotion: ${guard.blockedBy ?? guard.state}`);
    }
    const run = await this.runs.enqueue({
      organizationId: org.organizationId,
      eventId: event.id,
      feature: 'promotion_plan',
      trigger: 'on_demand',
      requestedByUserId: org.userId,
      instruction: input.instruction || null,
    });
    if (!run) throw new ConflictException('AI is not available');
    return {
      id: run.id,
      feature: run.feature,
      trigger: run.trigger,
      status: run.status,
      createdAt: run.createdAt.toISOString(),
      finishedAt: run.finishedAt?.toISOString() ?? null,
    };
  }

  /** Creates a task (and optionally an expense) per accepted action, in one transaction. */
  async accept(
    org: OrgContext,
    access: EventAccess,
    input: AcceptPromoActionsInput,
  ): Promise<void> {
    if (isReadOnly(access.event.status)) {
      throw new ConflictException('An archived event cannot be changed');
    }
    const eventId = access.event.id;
    // Committed first: the task and budget services check labels outside the transaction.
    const promotionLabel = await this.promotion.ensurePromotionLabel(
      withSource(org, { type: 'ai_suggestion', id: input.items[0]!.suggestionId }),
      eventId,
    );

    await this.db.transaction(async (tx) => {
      for (const item of input.items) {
        const row = await this.decide(tx, org, access, item.suggestionId);
        const payload = promoActionPayloadSchema.parse(row.payload);
        const scope = withSource(org, { type: 'ai_suggestion', id: row.id });
        const labelIds = [...new Set([...(item.task.labelIds ?? []), promotionLabel.id])];
        const created = await this.tasks.createInTransaction(tx, scope, access, {
          ...item.task,
          labelIds,
        });
        if (item.addBudgetLine && payload.estimatedCostCents > 0) {
          await this.budget.createTaskExpenseInTransaction(tx, scope, access, {
            title: created.title,
            estimatedCents: payload.estimatedCostCents,
            taskId: created.id,
            labelIds: [promotionLabel.id],
          });
        }
      }
      await this.live.publish(tx, { type: 'ai_suggestions', eventId });
    });
  }

  /** Marks the pending promo action accepted and logs it; 404 or 409 when it can't be. */
  private async decide(
    tx: Transaction,
    org: OrgContext,
    access: EventAccess,
    suggestionId: string,
  ): Promise<AiSuggestionRow> {
    const eventId = access.event.id;
    const current = await this.suggestions.find(eventId, suggestionId);
    if (!current || current.kind !== 'promo_action') {
      throw new NotFoundException('Suggestion not found');
    }
    const row = await this.suggestions.decide(
      tx,
      eventId,
      suggestionId,
      'promo_action',
      'accepted',
      org.userId,
    );
    if (!row) throw new ConflictException('The suggestion was already handled');
    await recordActivity(tx, org, {
      action: 'accepted',
      entityType: 'ai_suggestion',
      entity: row,
      before: current,
      eventId,
      values: SUGGESTION_LOGGED_VALUES,
    });
    return row;
  }
}
