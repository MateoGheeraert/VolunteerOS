import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, asc, desc, eq, inArray, or, sql } from 'drizzle-orm';
import type { Database, DbExecutor } from '../../db/database.js';
import {
  activityLog,
  aiRun,
  aiSuggestion,
  budgetEntry,
  budgetEntryLabelLink,
  eventAudience,
  label,
  task,
  taskLabelLink,
  user,
  type EventAudienceRow,
  type LabelRow,
  type NewEventAudienceRow,
} from '../../db/schema/index.js';
import { recordActivity, type ActivityScope } from '../../activity/activity-log.js';
import { notDeleted } from '../../db/soft-delete.js';
import { PROMOTION_LABEL } from './promotion-rules.js';

const LABEL_LOGGED_VALUES = ['name', 'color'] as const;

export type AudienceValues = Omit<
  NewEventAudienceRow,
  'id' | 'eventId' | 'createdAt' | 'updatedAt'
>;

/** The label is "Promotie", whatever its case. */
const isPromotionLabelSql = sql`lower(${label.name}) = ${PROMOTION_LABEL.name.toLowerCase()}`;

/**
 * Reads and writes for the Promotie tab and Mila's promotion plan: the Publiek, the tasks and
 * budget lines labelled Promotie, and the promo suggestions. Stateless (only the database), so
 * both the promotion feature and the AI module provide it. Callers pass an authorized event.
 */
@Injectable()
export class PromotionRepository {
  constructor(@InjectDrizzle() private readonly db: Database) {}

  async findAudience(eventId: string): Promise<EventAudienceRow | undefined> {
    const [row] = await this.db
      .select()
      .from(eventAudience)
      .where(eq(eventAudience.eventId, eventId))
      .limit(1);
    return row;
  }

  async upsertAudience(
    tx: DbExecutor,
    eventId: string,
    values: AudienceValues,
  ): Promise<EventAudienceRow> {
    const [row] = await tx
      .insert(eventAudience)
      .values({ ...values, eventId })
      .onConflictDoUpdate({ target: eventAudience.eventId, set: values })
      .returning();
    return row!;
  }

  /** The event's live "Promotie" label, if it has one. */
  async findPromotionLabel(
    eventId: string,
    db: DbExecutor = this.db,
  ): Promise<LabelRow | undefined> {
    const [row] = await db
      .select()
      .from(label)
      .where(and(eq(label.eventId, eventId), notDeleted(label), isPromotionLabelSql))
      .limit(1);
    return row;
  }

  /**
   * The event's Promotie label, created (purple) the first time a Promotie task is added: an
   * accepted action of Mila's or the organizer's own. `scope` is who it is logged for.
   */
  async ensurePromotionLabel(scope: ActivityScope, eventId: string): Promise<LabelRow> {
    const existing = await this.findPromotionLabel(eventId);
    if (existing) return existing;
    return this.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(label)
        .values({ eventId, name: PROMOTION_LABEL.name, color: PROMOTION_LABEL.color })
        // Someone made it at the same moment: use theirs.
        .onConflictDoNothing()
        .returning();
      if (!created) return (await this.findPromotionLabel(eventId, tx))!;
      await recordActivity(tx, scope, {
        action: 'created',
        entityType: 'label',
        entity: created,
        before: null,
        eventId,
        values: LABEL_LOGGED_VALUES,
      });
      return created;
    });
  }

  /** The event's live tasks labelled Promotie, soonest due first. */
  listPromotionTasks(eventId: string) {
    return this.db
      .selectDistinct({
        id: task.id,
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        dueDate: task.dueDate,
        assigneeUserId: task.assigneeUserId,
        assigneeName: task.assigneeName,
        assigneeUserName: user.name,
        createdAt: task.createdAt,
      })
      .from(task)
      .innerJoin(taskLabelLink, and(eq(taskLabelLink.taskId, task.id), notDeleted(taskLabelLink)))
      .innerJoin(label, and(eq(label.id, taskLabelLink.labelId), notDeleted(label)))
      .leftJoin(user, eq(user.id, task.assigneeUserId))
      .where(and(eq(task.eventId, eventId), notDeleted(task), isPromotionLabelSql))
      .orderBy(sql`${task.dueDate} asc nulls last`, asc(task.createdAt));
  }

  /** Live budget lines labelled Promotie, or linked to one of `taskIds`. */
  async listPromotionBudgetLines(eventId: string, taskIds: string[]) {
    const labelled = this.db
      .select({ id: budgetEntryLabelLink.budgetEntryId })
      .from(budgetEntryLabelLink)
      .innerJoin(label, and(eq(label.id, budgetEntryLabelLink.labelId), notDeleted(label)))
      .where(and(notDeleted(budgetEntryLabelLink), isPromotionLabelSql));
    return this.db
      .select({
        id: budgetEntry.id,
        type: budgetEntry.type,
        title: budgetEntry.title,
        estimatedCents: budgetEntry.estimatedCents,
        actualCents: budgetEntry.actualCents,
        notes: budgetEntry.notes,
        taskId: budgetEntry.taskId,
      })
      .from(budgetEntry)
      .where(
        and(
          eq(budgetEntry.eventId, eventId),
          notDeleted(budgetEntry),
          taskIds.length > 0
            ? or(inArray(budgetEntry.id, labelled), inArray(budgetEntry.taskId, taskIds))
            : inArray(budgetEntry.id, labelled),
        ),
      )
      .orderBy(asc(budgetEntry.createdAt));
  }

  /** Every promo suggestion of the event, oldest first. */
  listPromoSuggestions(eventId: string) {
    return this.db
      .select()
      .from(aiSuggestion)
      .where(and(eq(aiSuggestion.eventId, eventId), eq(aiSuggestion.kind, 'promo_action')))
      .orderBy(asc(aiSuggestion.createdAt), asc(aiSuggestion.title));
  }

  async latestPromotionRun(eventId: string) {
    const [row] = await this.db
      .select()
      .from(aiRun)
      .where(and(eq(aiRun.eventId, eventId), eq(aiRun.feature, 'promotion_plan')))
      .orderBy(desc(aiRun.createdAt))
      .limit(1);
    return row;
  }

  /** The tasks created by accepting these suggestions (the activity log keeps the source). */
  async tasksCreatedFrom(suggestionIds: string[]) {
    if (suggestionIds.length === 0) return [];
    return this.db
      .select({ id: task.id, status: task.status })
      .from(activityLog)
      .innerJoin(task, sql`${task.id}::text = ${activityLog.entityId}`)
      .where(
        and(
          eq(activityLog.entityType, 'task'),
          eq(activityLog.action, 'created'),
          eq(activityLog.sourceType, 'ai_suggestion'),
          inArray(activityLog.sourceId, suggestionIds),
          notDeleted(task),
        ),
      );
  }
}
