import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, asc, count, eq, inArray, notInArray, sql } from 'drizzle-orm';
import type { Database, DbExecutor } from '../../db/database.js';
import {
  budgetEntry,
  budgetEntryLabelLink,
  budgetEntryUpload,
  label,
  supplier,
  task,
  upload,
  type BudgetEntryRow,
  type TaskRow,
} from '../../db/schema/index.js';
import { notDeleted } from '../../db/soft-delete.js';

/** A budget entry with its labels, its (live) task and how many files it has. */
export interface BudgetEntryView {
  entry: BudgetEntryRow;
  task: Pick<TaskRow, 'id' | 'title' | 'assigneeUserId' | 'assigneeName'> | null;
  supplier: { id: string; name: string; archivedAt: Date | null } | null;
  labelIds: string[];
  fileCount: number;
}

export type BudgetEntryValues = Pick<
  BudgetEntryRow,
  'type' | 'title' | 'estimatedCents' | 'actualCents' | 'notes' | 'taskId' | 'supplierId'
>;

/**
 * Data access for budget entries and their label links. Callers pass an already authorized
 * event. Reads skip soft-deleted rows.
 */
@Injectable()
export class BudgetRepository {
  constructor(@InjectDrizzle() private readonly db: Database) {}

  /** The event's live entries (or one), income first, then oldest first. */
  async listViews(eventId: string, entryId?: string): Promise<BudgetEntryView[]> {
    const rows = await this.db
      .select({
        entry: budgetEntry,
        task: {
          id: task.id,
          title: task.title,
          assigneeUserId: task.assigneeUserId,
          assigneeName: task.assigneeName,
        },
        supplier: { id: supplier.id, name: supplier.name, archivedAt: supplier.archivedAt },
      })
      .from(budgetEntry)
      .leftJoin(task, and(eq(task.id, budgetEntry.taskId), notDeleted(task)))
      .leftJoin(supplier, and(eq(supplier.id, budgetEntry.supplierId), notDeleted(supplier)))
      .where(
        and(
          eq(budgetEntry.eventId, eventId),
          notDeleted(budgetEntry),
          entryId ? eq(budgetEntry.id, entryId) : undefined,
        ),
      )
      // The enum is declared income, expense.
      .orderBy(asc(budgetEntry.type), asc(budgetEntry.createdAt), asc(budgetEntry.id));

    const ids = rows.map((row) => row.entry.id);
    const [links, files] = await Promise.all([this.labelLinks(ids), this.fileCounts(ids)]);
    return rows.map((row) => ({
      entry: row.entry,
      task: row.task?.id ? row.task : null,
      supplier: row.supplier?.id ? row.supplier : null,
      labelIds: links.filter((l) => l.entryId === row.entry.id).map((l) => l.labelId),
      fileCount: files.find((f) => f.entryId === row.entry.id)?.n ?? 0,
    }));
  }

  private labelLinks(entryIds: string[]) {
    if (entryIds.length === 0) return Promise.resolve([]);
    return this.db
      .select({
        entryId: budgetEntryLabelLink.budgetEntryId,
        labelId: budgetEntryLabelLink.labelId,
      })
      .from(budgetEntryLabelLink)
      .innerJoin(label, eq(label.id, budgetEntryLabelLink.labelId))
      .where(
        and(
          inArray(budgetEntryLabelLink.budgetEntryId, entryIds),
          notDeleted(budgetEntryLabelLink),
          notDeleted(label),
        ),
      )
      .orderBy(asc(sql`lower(${label.name})`));
  }

  /** Listed files per entry: live and confirmed. */
  private fileCounts(entryIds: string[]) {
    if (entryIds.length === 0) return Promise.resolve([]);
    return this.db
      .select({ entryId: budgetEntryUpload.budgetEntryId, n: count() })
      .from(budgetEntryUpload)
      .innerJoin(upload, eq(upload.id, budgetEntryUpload.uploadId))
      .where(
        and(
          inArray(budgetEntryUpload.budgetEntryId, entryIds),
          notDeleted(upload),
          eq(upload.status, 'ready'),
        ),
      )
      .groupBy(budgetEntryUpload.budgetEntryId);
  }

  async find(eventId: string, entryId: string): Promise<BudgetEntryRow | undefined> {
    const [row] = await this.db
      .select()
      .from(budgetEntry)
      .where(
        and(eq(budgetEntry.id, entryId), eq(budgetEntry.eventId, eventId), notDeleted(budgetEntry)),
      )
      .limit(1);
    return row;
  }

  /** Whether the task is a live task of the event. */
  async isEventTask(eventId: string, taskId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: task.id })
      .from(task)
      .where(and(eq(task.id, taskId), eq(task.eventId, eventId), notDeleted(task)))
      .limit(1);
    return row !== undefined;
  }

  async insert(
    tx: DbExecutor,
    eventId: string,
    createdByUserId: string,
    values: BudgetEntryValues,
  ): Promise<BudgetEntryRow> {
    const [created] = await tx
      .insert(budgetEntry)
      .values({ ...values, eventId, createdByUserId })
      .returning();
    return created!;
  }

  async update(
    tx: DbExecutor,
    entryId: string,
    patch: Partial<BudgetEntryValues> & { deletedAt?: Date },
  ): Promise<BudgetEntryRow> {
    const [updated] = await tx
      .update(budgetEntry)
      .set(patch)
      .where(and(eq(budgetEntry.id, entryId), notDeleted(budgetEntry)))
      .returning();
    return updated!;
  }

  /** Sets `updated_at` to now, for a change that lives in another table (its labels). */
  async touch(tx: DbExecutor, entryId: string): Promise<BudgetEntryRow> {
    const [updated] = await tx
      .update(budgetEntry)
      .set({ updatedAt: new Date() })
      .where(and(eq(budgetEntry.id, entryId), notDeleted(budgetEntry)))
      .returning();
    return updated!;
  }

  /** The entry's live label ids, sorted so they compare as a set. */
  async labelIdsOf(db: DbExecutor, entryId: string): Promise<string[]> {
    const rows = await db
      .select({ labelId: budgetEntryLabelLink.labelId })
      .from(budgetEntryLabelLink)
      .innerJoin(label, eq(label.id, budgetEntryLabelLink.labelId))
      .where(
        and(
          eq(budgetEntryLabelLink.budgetEntryId, entryId),
          notDeleted(budgetEntryLabelLink),
          notDeleted(label),
        ),
      );
    return rows.map((row) => row.labelId).sort();
  }

  /** Makes `labelIds` the entry's labels: unlinks the others, links the missing ones. */
  async setLabels(tx: DbExecutor, entryId: string, labelIds: string[]): Promise<void> {
    await tx
      .update(budgetEntryLabelLink)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(budgetEntryLabelLink.budgetEntryId, entryId),
          notDeleted(budgetEntryLabelLink),
          labelIds.length > 0 ? notInArray(budgetEntryLabelLink.labelId, labelIds) : undefined,
        ),
      );
    if (labelIds.length === 0) return;
    await tx
      .insert(budgetEntryLabelLink)
      .values(labelIds.map((labelId) => ({ budgetEntryId: entryId, labelId })))
      .onConflictDoNothing({
        target: [budgetEntryLabelLink.budgetEntryId, budgetEntryLabelLink.labelId],
        where: sql`${budgetEntryLabelLink.deletedAt} is null`,
      });
  }

  /** Clears the task link of the live entries linked to the task; returns them before and after. */
  async unlinkTask(
    tx: DbExecutor,
    taskId: string,
  ): Promise<{ before: BudgetEntryRow; after: BudgetEntryRow }[]> {
    const linked = await tx
      .select()
      .from(budgetEntry)
      .where(and(eq(budgetEntry.taskId, taskId), notDeleted(budgetEntry)));
    const changed = [];
    for (const before of linked) {
      changed.push({ before, after: await this.update(tx, before.id, { taskId: null }) });
    }
    return changed;
  }
}
