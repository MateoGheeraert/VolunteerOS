import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, asc, count, eq, inArray, sql } from 'drizzle-orm';
import type { Database, DbExecutor } from '../../db/database.js';
import { label, task, taskLabelLink, type LabelRow } from '../../db/schema/index.js';
import { notDeleted } from '../../db/soft-delete.js';
import type { CreateLabelInput, LabelUsageDto, UpdateLabelInput } from './labels.schemas.js';

/**
 * Data access for an event's labels. Callers pass an already authorized event. Reads skip
 * soft-deleted rows.
 */
@Injectable()
export class LabelsRepository {
  constructor(@InjectDrizzle() private readonly db: Database) {}

  /** Live labels of the given events (already authorized), by name. */
  async list(eventIds: string[]): Promise<LabelRow[]> {
    if (eventIds.length === 0) return [];
    return this.db
      .select()
      .from(label)
      .where(and(inArray(label.eventId, eventIds), notDeleted(label)))
      .orderBy(asc(sql`lower(${label.name})`));
  }

  async find(eventId: string, labelId: string): Promise<LabelRow | undefined> {
    const [row] = await this.db
      .select()
      .from(label)
      .where(and(eq(label.id, labelId), eq(label.eventId, eventId), notDeleted(label)))
      .limit(1);
    return row;
  }

  /** How many of `labelIds` are live labels of the event. */
  async count(eventId: string, labelIds: string[]): Promise<number> {
    if (labelIds.length === 0) return 0;
    const [row] = await this.db
      .select({ n: count() })
      .from(label)
      .where(and(eq(label.eventId, eventId), inArray(label.id, labelIds), notDeleted(label)));
    return row!.n;
  }

  /** How many live tasks and budget entries carry the label. */
  async usage(labelId: string): Promise<LabelUsageDto> {
    const [tasks] = await this.db
      .select({ n: count() })
      .from(taskLabelLink)
      .innerJoin(task, eq(task.id, taskLabelLink.taskId))
      .where(and(eq(taskLabelLink.labelId, labelId), notDeleted(taskLabelLink), notDeleted(task)));
    // Budget entries carry labels once the budget exists.
    return { tasks: tasks!.n, budgetEntries: 0 };
  }

  async insert(tx: DbExecutor, eventId: string, input: CreateLabelInput): Promise<LabelRow> {
    const [created] = await tx
      .insert(label)
      .values({ eventId, name: input.name, color: input.color })
      .returning();
    return created!;
  }

  async update(
    tx: DbExecutor,
    labelId: string,
    patch: UpdateLabelInput & { deletedAt?: Date },
  ): Promise<LabelRow> {
    const [updated] = await tx
      .update(label)
      .set(patch)
      .where(and(eq(label.id, labelId), notDeleted(label)))
      .returning();
    return updated!;
  }

  /** Takes the label off everything that carries it. */
  async unlinkEverywhere(tx: DbExecutor, labelId: string): Promise<void> {
    const deletedAt = new Date();
    await tx
      .update(taskLabelLink)
      .set({ deletedAt })
      .where(and(eq(taskLabelLink.labelId, labelId), notDeleted(taskLabelLink)));
  }
}
