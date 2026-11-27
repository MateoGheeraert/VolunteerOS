import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { recordActivity } from '../../activity/activity-log.js';
import { AI_MODEL_RESOLVER, type AiModelResolver } from '../../ai/ai-models.js';
import { toSuggestionDto } from '../../ai/suggestions/ai-suggestions.service.js';
import type { EventAccess } from '../../authz/event-access.service.js';
import type { OrgContext } from '../../authz/org-context.js';
import type { Database } from '../../db/database.js';
import type { EventAudienceRow } from '../../db/schema/index.js';
import { isReadOnly } from '../events/event-status.js';
import { canSeeTask } from '../tasks/task-rules.js';
import type { CreateTaskInput, TaskDto } from '../tasks/tasks.schemas.js';
import { TasksService } from '../tasks/tasks.service.js';
import {
  AUDIENCE_LOGGED_VALUES,
  promotionBudget,
  promotionGuardFor,
  promotionMetric,
  sizeBand,
} from './promotion-rules.js';
import type { AudienceDto, PromotionStateDto, UpdateAudienceInput } from './promotion.schemas.js';
import { PromotionRepository } from './promotion.repository.js';

const EMPTY_AUDIENCE: AudienceDto = {
  audiences: [],
  description: null,
  ageMin: null,
  ageMax: null,
  region: null,
  entryPriceCents: null,
  pitch: null,
  promotionBudgetCents: null,
};

/** The Promotie tab: the event's Publiek, its Promotie tasks and Mila's plan (§7.11). */
@Injectable()
export class PromotionService {
  constructor(
    @InjectDrizzle() private readonly db: Database,
    private readonly promotion: PromotionRepository,
    @Inject(AI_MODEL_RESOLVER) private readonly ai: AiModelResolver,
    private readonly tasks: TasksService,
  ) {}

  async state(org: OrgContext, access: EventAccess, now = new Date()): Promise<PromotionStateDto> {
    const { event, canManage } = access;
    const [audienceRow, tasks, suggestions, run] = await Promise.all([
      this.promotion.findAudience(event.id),
      this.promotion.listPromotionTasks(event.id),
      this.promotion.listPromoSuggestions(event.id),
      canManage ? this.promotion.latestPromotionRun(event.id) : Promise.resolve(undefined),
    ]);
    const audience = audienceRow ? toAudienceDto(audienceRow) : EMPTY_AUDIENCE;
    const accepted = suggestions.filter((row) => row.status === 'accepted');
    const [lines, fromMila] = await Promise.all([
      this.promotion.listPromotionBudgetLines(
        event.id,
        tasks.map((row) => row.id),
      ),
      this.promotion.tasksCreatedFrom(accepted.map((row) => row.id)),
    ]);
    const milaTaskIds = new Set(fromMila.map((row) => row.id));
    const viewer = { userId: org.userId, canManage };

    return {
      audience,
      sizeBand: sizeBand(event.expectedAttendance),
      guard: promotionGuardFor(event, audience, now),
      budget: promotionBudget(audience.promotionBudgetCents, lines),
      tasks: tasks
        .filter((row) => canSeeTask(viewer, row))
        .map((row) => ({
          id: row.id,
          title: row.title,
          status: row.status,
          priority: row.priority,
          dueDate: row.dueDate,
          assigneeName: row.assigneeUserName ?? row.assigneeName,
          fromMila: milaTaskIds.has(row.id),
        })),
      metric: promotionMetric(
        suggestions,
        fromMila.map((row) => row.status),
      ),
      mila: canManage
        ? {
            enabled: this.ai.enabled,
            run: run
              ? {
                  status: run.status,
                  createdAt: run.createdAt.toISOString(),
                  instruction: run.instruction,
                }
              : null,
            suggestions: suggestions.filter((row) => row.status === 'pending').map(toSuggestionDto),
          }
        : null,
    };
  }

  /**
   * The organizer's own promotion action: a normal task, always labelled Promotie (the label is
   * created when the event has none yet), so it shows on the timeline and Mila plans around it.
   */
  async createTask(org: OrgContext, access: EventAccess, input: CreateTaskInput): Promise<TaskDto> {
    if (isReadOnly(access.event.status)) {
      throw new ConflictException('An archived event cannot be changed');
    }
    const promotionLabel = await this.promotion.ensurePromotionLabel(org, access.event.id);
    return this.tasks.create(org, access, {
      ...input,
      labelIds: [...new Set([...(input.labelIds ?? []), promotionLabel.id])],
    });
  }

  /** Saves the whole Publiek; the first save creates it. Archived events are read-only. */
  async updateAudience(
    org: OrgContext,
    access: EventAccess,
    input: UpdateAudienceInput,
  ): Promise<AudienceDto> {
    const eventId = access.event.id;
    if (isReadOnly(access.event.status)) {
      throw new ConflictException('An archived event cannot be changed');
    }
    const before = await this.promotion.findAudience(eventId);
    const saved = await this.db.transaction(async (tx) => {
      const row = await this.promotion.upsertAudience(tx, eventId, {
        audiences: [...new Set(input.audiences)],
        description: input.description || null,
        ageMin: input.ageMin,
        ageMax: input.ageMax,
        region: input.region || null,
        entryPriceCents: input.entryPriceCents,
        pitch: input.pitch || null,
        promotionBudgetCents: input.promotionBudgetCents,
      });
      await recordActivity(tx, org, {
        action: before ? 'updated' : 'created',
        entityType: 'event_audience',
        entity: row,
        before: before ?? null,
        eventId,
        values: AUDIENCE_LOGGED_VALUES,
      });
      return row;
    });
    return toAudienceDto(saved);
  }
}

const toAudienceDto = (row: EventAudienceRow): AudienceDto => ({
  audiences: row.audiences,
  description: row.description,
  ageMin: row.ageMin,
  ageMax: row.ageMax,
  region: row.region,
  entryPriceCents: row.entryPriceCents,
  pitch: row.pitch,
  promotionBudgetCents: row.promotionBudgetCents,
});
