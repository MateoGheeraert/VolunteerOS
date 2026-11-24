import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, asc, desc, eq, inArray, isNotNull, isNull, lt, or, sql, sum } from 'drizzle-orm';
import type { Database, DbExecutor } from '../../db/database.js';
import {
  eventUpload,
  task,
  taskUpload,
  upload,
  user,
  type TaskRow,
  type UploadRow,
} from '../../db/schema/index.js';
import { notDeleted } from '../../db/soft-delete.js';

/** A file with who uploaded it and, for a task file, the task. */
export interface UploadView {
  upload: UploadRow;
  uploaderName: string;
  task: Pick<TaskRow, 'id' | 'title' | 'assigneeUserId' | 'assigneeName'> | null;
}

/**
 * Data access for uploaded files and what they are attached to. Reads take the organization and
 * event, so they can never reach another tenant's files, and skip soft-deleted rows (and files of
 * deleted tasks).
 */
@Injectable()
export class UploadsRepository {
  constructor(@InjectDrizzle() private readonly db: Database) {}

  /**
   * The event's files and those of its tasks, newest first. Options narrow them down:
   * - `uploadId`: one file.
   * - `taskId`: one task's files.
   * - `status`: only ready (listed) or also pending (being confirmed) files.
   */
  async listViews(
    organizationId: string,
    eventId: string,
    options: { uploadId?: string; taskId?: string; readyOnly: boolean },
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
      })
      .from(upload)
      .innerJoin(user, eq(user.id, upload.uploadedByUserId))
      .leftJoin(eventUpload, eq(eventUpload.uploadId, upload.id))
      .leftJoin(taskUpload, eq(taskUpload.uploadId, upload.id))
      .leftJoin(task, and(eq(task.id, taskUpload.taskId), notDeleted(task)))
      .where(
        and(
          eq(upload.organizationId, organizationId),
          notDeleted(upload),
          options.readyOnly ? eq(upload.status, 'ready') : undefined,
          options.uploadId ? eq(upload.id, options.uploadId) : undefined,
          options.taskId
            ? eq(task.id, options.taskId)
            : or(eq(eventUpload.eventId, eventId), eq(task.eventId, eventId)),
          // A task file only counts while its task is of this event.
          options.taskId ? eq(task.eventId, eventId) : undefined,
        ),
      )
      .orderBy(desc(upload.createdAt), asc(upload.id));
    return rows.map((row) => ({ ...row, task: row.task?.id ? row.task : null }));
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
    owner: { eventId: string } | { taskId: string },
  ): Promise<UploadRow> {
    const [row] = await tx.insert(upload).values(values).returning();
    if ('taskId' in owner) {
      await tx.insert(taskUpload).values({ uploadId: row!.id, taskId: owner.taskId });
    } else {
      await tx.insert(eventUpload).values({ uploadId: row!.id, eventId: owner.eventId });
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
}
