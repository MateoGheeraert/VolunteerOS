import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, asc, desc, eq, inArray, isNotNull, isNull, lt, or, sql, sum } from 'drizzle-orm';
import type { Database, DbExecutor } from '../../db/database.js';
import {
  budgetEntry,
  budgetEntryUpload,
  eventUpload,
  task,
  taskUpload,
  upload,
  user,
  type BudgetEntryRow,
  type TaskRow,
  type UploadRow,
} from '../../db/schema/index.js';
import { notDeleted } from '../../db/soft-delete.js';

/** A file with who uploaded it and the task or budget entry it is attached to, if any. */
export interface UploadView {
  upload: UploadRow;
  uploaderName: string;
  task: Pick<TaskRow, 'id' | 'title' | 'assigneeUserId' | 'assigneeName'> | null;
  budgetEntry: Pick<BudgetEntryRow, 'id' | 'title'> | null;
}

/** What a new file is attached to. */
export type UploadOwnerRef = { eventId: string } | { taskId: string } | { budgetEntryId: string };

/**
 * Data access for uploaded files and what they are attached to. Reads take the organization and
 * event, so they can never reach another tenant's files, and skip soft-deleted rows (and files of
 * deleted tasks and budget entries).
 */
@Injectable()
export class UploadsRepository {
  constructor(@InjectDrizzle() private readonly db: Database) {}

  /**
   * The event's files and those of its tasks and budget entries, newest first. Options narrow
   * them down:
   * - `uploadId`: one file.
   * - `taskId`: one task's files.
   * - `budgetEntryId`: one budget entry's files.
   * - `readyOnly`: only ready (listed) or also pending (being confirmed) files.
   */
  async listViews(
    organizationId: string,
    eventId: string,
    options: { uploadId?: string; taskId?: string; budgetEntryId?: string; readyOnly: boolean },
  ): Promise<UploadView[]> {
    const rows = await this.db
      .select({
        upload,
        uploaderName: user.name,
        task: {
          id: task.id,
          title: task.title,
          assigneeUserId: task.assigneeUserId,
          assigneeName: task.assigneeName,
        },
        budgetEntry: { id: budgetEntry.id, title: budgetEntry.title },
      })
      .from(upload)
      .innerJoin(user, eq(user.id, upload.uploadedByUserId))
      .leftJoin(eventUpload, eq(eventUpload.uploadId, upload.id))
      .leftJoin(taskUpload, eq(taskUpload.uploadId, upload.id))
      .leftJoin(task, and(eq(task.id, taskUpload.taskId), notDeleted(task)))
      .leftJoin(budgetEntryUpload, eq(budgetEntryUpload.uploadId, upload.id))
      .leftJoin(
        budgetEntry,
        and(eq(budgetEntry.id, budgetEntryUpload.budgetEntryId), notDeleted(budgetEntry)),
      )
      .where(
        and(
          eq(upload.organizationId, organizationId),
          notDeleted(upload),
          options.readyOnly ? eq(upload.status, 'ready') : undefined,
          options.uploadId ? eq(upload.id, options.uploadId) : undefined,
          ownerCondition(eventId, options),
        ),
      )
      .orderBy(desc(upload.createdAt), asc(upload.id));
    return rows.map((row) => ({
      ...row,
      task: row.task?.id ? row.task : null,
      budgetEntry: row.budgetEntry?.id ? row.budgetEntry : null,
    }));
  }

  /** What the organization stores: live files, those still being uploaded included. */
  async usedBytes(db: DbExecutor, organizationId: string): Promise<number> {
    const [row] = await db
      .select({ used: sum(upload.sizeBytes).mapWith(Number) })
      .from(upload)
      .where(and(eq(upload.organizationId, organizationId), notDeleted(upload)));
    return row?.used ?? 0;
  }

  /** Serializes uploads of one organization until the transaction ends, so the cap holds. */
  async lockOrganization(tx: DbExecutor, organizationId: string): Promise<void> {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`upload:${organizationId}`}))`);
  }

  async insert(
    tx: DbExecutor,
    values: Pick<
      UploadRow,
      | 'id'
      | 'organizationId'
      | 'storageKey'
      | 'name'
      | 'mimeType'
      | 'sizeBytes'
      | 'uploadedByUserId'
    >,
    owner: UploadOwnerRef,
  ): Promise<UploadRow> {
    const [row] = await tx.insert(upload).values(values).returning();
    const uploadId = row!.id;
    if ('taskId' in owner) {
      await tx.insert(taskUpload).values({ uploadId, taskId: owner.taskId });
    } else if ('budgetEntryId' in owner) {
      await tx.insert(budgetEntryUpload).values({ uploadId, budgetEntryId: owner.budgetEntryId });
    } else {
      await tx.insert(eventUpload).values({ uploadId, eventId: owner.eventId });
    }
    return row!;
  }

  async update(
    tx: DbExecutor,
    uploadId: string,
    patch: Partial<Pick<UploadRow, 'name' | 'status' | 'deletedAt' | 'purgedAt'>>,
  ): Promise<UploadRow> {
    const [row] = await tx.update(upload).set(patch).where(eq(upload.id, uploadId)).returning();
    return row!;
  }

  /** Soft-deletes a task's live files; returns them as they were. */
  async deleteForTask(tx: DbExecutor, taskId: string, now: Date): Promise<UploadRow[]> {
    const ids = tx
      .select({ id: taskUpload.uploadId })
      .from(taskUpload)
      .where(eq(taskUpload.taskId, taskId));
    return tx
      .update(upload)
      .set({ deletedAt: now })
      .where(and(inArray(upload.id, ids), notDeleted(upload)))
      .returning();
  }

  /** Soft-deletes a budget entry's live files; returns them as they were. */
  async deleteForBudgetEntry(
    tx: DbExecutor,
    budgetEntryId: string,
    now: Date,
  ): Promise<UploadRow[]> {
    const ids = tx
      .select({ id: budgetEntryUpload.uploadId })
      .from(budgetEntryUpload)
      .where(eq(budgetEntryUpload.budgetEntryId, budgetEntryId));
    return tx
      .update(upload)
      .set({ deletedAt: now })
      .where(and(inArray(upload.id, ids), notDeleted(upload)))
      .returning();
  }

  /** Marks uploads that were never confirmed before `before` as deleted; returns how many. */
  async deleteAbandoned(before: Date, now: Date): Promise<number> {
    const rows = await this.db
      .update(upload)
      .set({ deletedAt: now })
      .where(and(eq(upload.status, 'pending'), notDeleted(upload), lt(upload.createdAt, before)))
      .returning({ id: upload.id });
    return rows.length;
  }

  /**
   * Deleted files whose object is still in storage and due to go: abandoned uploads right away,
   * deleted files once they were deleted before `deletedBefore`.
   */
  async listPurgeable(
    deletedBefore: Date,
    limit: number,
  ): Promise<Pick<UploadRow, 'id' | 'storageKey'>[]> {
    return this.db
      .select({ id: upload.id, storageKey: upload.storageKey })
      .from(upload)
      .where(
        and(
          isNull(upload.purgedAt),
          isNotNull(upload.deletedAt),
          or(eq(upload.status, 'pending'), lt(upload.deletedAt, deletedBefore)),
        ),
      )
      .orderBy(asc(upload.deletedAt))
      .limit(limit);
  }

  async markPurged(uploadId: string, now: Date): Promise<void> {
    await this.db.update(upload).set({ purgedAt: now }).where(eq(upload.id, uploadId));
  }

  /** A live task of the event. */
  async findTask(
    eventId: string,
    taskId: string,
  ): Promise<Pick<TaskRow, 'id' | 'title' | 'assigneeUserId' | 'assigneeName'> | undefined> {
    const [row] = await this.db
      .select({
        id: task.id,
        title: task.title,
        assigneeUserId: task.assigneeUserId,
        assigneeName: task.assigneeName,
      })
      .from(task)
      .where(and(eq(task.id, taskId), eq(task.eventId, eventId), notDeleted(task)))
      .limit(1);
    return row;
  }

  /** A live budget entry of the event. */
  async findBudgetEntry(
    eventId: string,
    budgetEntryId: string,
  ): Promise<Pick<BudgetEntryRow, 'id' | 'title'> | undefined> {
    const [row] = await this.db
      .select({ id: budgetEntry.id, title: budgetEntry.title })
      .from(budgetEntry)
      .where(
        and(
          eq(budgetEntry.id, budgetEntryId),
          eq(budgetEntry.eventId, eventId),
          notDeleted(budgetEntry),
        ),
      )
      .limit(1);
    return row;
  }
}

/**
 * Which files of the event a list covers: one task's or one budget entry's (while it is of this
 * event), or else the event's own files with those of its tasks and budget entries.
 */
function ownerCondition(eventId: string, options: { taskId?: string; budgetEntryId?: string }) {
  if (options.taskId) return and(eq(task.id, options.taskId), eq(task.eventId, eventId));
  if (options.budgetEntryId) {
    return and(eq(budgetEntry.id, options.budgetEntryId), eq(budgetEntry.eventId, eventId));
  }
  return or(
    eq(eventUpload.eventId, eventId),
    eq(task.eventId, eventId),
    eq(budgetEntry.eventId, eventId),
  );
}
