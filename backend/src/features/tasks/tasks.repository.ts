import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, asc, count, desc, eq, inArray, isNull, ne, notInArray, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Database, DbExecutor } from '../../db/database.js';
import {
  event,
  member,
  task,
  label,
  taskAssignmentRequest,
  taskLabelLink,
  user,
  type EventRow,
  type TaskAssignmentRequestRow,
  type TaskAssignmentRequestStatus,
  type TaskRow,
} from '../../db/schema/index.js';
import { notDeleted } from '../../db/soft-delete.js';

/** A task with the names of the people it refers to, and whether they are still members. */
export interface TaskView {
  task: TaskRow;
  event: Pick<EventRow, 'id' | 'name' | 'status' | 'startsAt' | 'endsAt'>;
  assigneeUserName: string | null;
  assigneeActive: boolean;
  creatorName: string;
  creatorActive: boolean;
  labelIds: string[];
  pendingRequests: { id: string; userId: string; name: string; createdAt: Date }[];
}

export type TaskValues = Pick<
  TaskRow,
  'title' | 'description' | 'status' | 'priority' | 'dueDate' | 'assigneeUserId' | 'assigneeName'
>;

const assigneeUser = alias(user, 'assignee_user');
const assigneeMember = alias(member, 'assignee_member');
const creatorUser = alias(user, 'creator_user');
const creatorMember = alias(member, 'creator_member');

/**
 * Data access for tasks, their label links and assignment requests. Reads take the organization and
 * join the event, so they can never reach another tenant's rows; writes take an already
 * authorized event or task. Reads skip soft-deleted rows.
 */
@Injectable()
export class TasksRepository {
  constructor(@InjectDrizzle() private readonly db: Database) {}

  /**
   * Tasks of the organization, high priority first, then by due date (none last), then oldest
   * first. Options narrow them down:
   * - `eventId`: one event's tasks (else every live, not archived event of the organization).
   * - `taskId`: one task.
   * - `visibleTo`: that member's own and the unassigned ones.
   * - `assignedTo`: only that member's.
   * - `requestsOf`: only that member's pending requests.
   */
  async listViews(
    organizationId: string,
    options: {
      eventId?: string;
      taskId?: string;
      visibleTo?: string;
      assignedTo?: string;
      requestsOf?: string;
    },
  ): Promise<TaskView[]> {
    const rows = await this.db
      .select({
        task,
        event: {
          id: event.id,
          name: event.name,
          status: event.status,
          startsAt: event.startsAt,
          endsAt: event.endsAt,
        },
        assigneeUserName: assigneeUser.name,
        assigneeMemberId: assigneeMember.id,
        creatorName: creatorUser.name,
        creatorMemberId: creatorMember.id,
      })
      .from(task)
      .innerJoin(event, eq(event.id, task.eventId))
      .innerJoin(creatorUser, eq(creatorUser.id, task.createdByUserId))
      .leftJoin(assigneeUser, eq(assigneeUser.id, task.assigneeUserId))
      .leftJoin(
        assigneeMember,
        and(
          eq(assigneeMember.userId, task.assigneeUserId),
          eq(assigneeMember.organizationId, organizationId),
        ),
      )
      .leftJoin(
        creatorMember,
        and(
          eq(creatorMember.userId, task.createdByUserId),
          eq(creatorMember.organizationId, organizationId),
        ),
      )
      .where(
        and(
          eq(event.organizationId, organizationId),
          notDeleted(task),
          options.eventId
            ? eq(task.eventId, options.eventId)
            : and(notDeleted(event), ne(event.status, 'archived')),
          options.assignedTo ? eq(task.assigneeUserId, options.assignedTo) : undefined,
          options.taskId ? eq(task.id, options.taskId) : undefined,
          options.visibleTo
            ? or(
                eq(task.assigneeUserId, options.visibleTo),
                and(isNull(task.assigneeUserId), isNull(task.assigneeName)),
              )
            : undefined,
        ),
      )
      .orderBy(desc(task.priority), sql`${task.dueDate} asc nulls last`, asc(task.createdAt));

    const taskIds = rows.map((row) => row.task.id);
    const [links, requests] = await Promise.all([
      this.labelLinks(taskIds),
      this.pendingRequests(taskIds, options.requestsOf),
    ]);
    return rows.map((row) => ({
      task: row.task,
      event: row.event,
      assigneeUserName: row.assigneeUserName,
      assigneeActive: row.assigneeMemberId !== null,
      creatorName: row.creatorName,
      creatorActive: row.creatorMemberId !== null,
      labelIds: links.filter((l) => l.taskId === row.task.id).map((l) => l.labelId),
      pendingRequests: requests
        .filter((r) => r.taskId === row.task.id)
        .map(({ id, userId, name, createdAt }) => ({ id, userId, name, createdAt })),
    }));
  }

  private labelLinks(taskIds: string[]) {
    if (taskIds.length === 0) return Promise.resolve([]);
    return this.db
      .select({ taskId: taskLabelLink.taskId, labelId: taskLabelLink.labelId })
      .from(taskLabelLink)
      .innerJoin(label, eq(label.id, taskLabelLink.labelId))
      .where(
        and(inArray(taskLabelLink.taskId, taskIds), notDeleted(taskLabelLink), notDeleted(label)),
      )
      .orderBy(asc(label.name));
  }

  private pendingRequests(taskIds: string[], userId?: string) {
    if (taskIds.length === 0) return Promise.resolve([]);
    return this.db
      .select({
        id: taskAssignmentRequest.id,
        taskId: taskAssignmentRequest.taskId,
        userId: taskAssignmentRequest.userId,
        name: user.name,
        createdAt: taskAssignmentRequest.createdAt,
      })
      .from(taskAssignmentRequest)
      .innerJoin(user, eq(user.id, taskAssignmentRequest.userId))
      .where(
        and(
          inArray(taskAssignmentRequest.taskId, taskIds),
          eq(taskAssignmentRequest.status, 'pending'),
          notDeleted(taskAssignmentRequest),
          userId ? eq(taskAssignmentRequest.userId, userId) : undefined,
        ),
      )
      .orderBy(asc(taskAssignmentRequest.createdAt));
  }

  /** A live task of the event. */
  async findTask(eventId: string, taskId: string): Promise<TaskRow | undefined> {
    const [row] = await this.db
      .select()
      .from(task)
      .where(and(eq(task.id, taskId), eq(task.eventId, eventId), notDeleted(task)))
      .limit(1);
    return row;
  }

  async insertTask(
    tx: DbExecutor,
    eventId: string,
    createdByUserId: string,
    values: TaskValues,
  ): Promise<TaskRow> {
    const [created] = await tx
      .insert(task)
      .values({ ...values, eventId, createdByUserId })
      .returning();
    return created!;
  }

  async updateTask(
    tx: DbExecutor,
    taskId: string,
    patch: Partial<TaskValues> & { deletedAt?: Date },
  ): Promise<TaskRow> {
    const [updated] = await tx
      .update(task)
      .set(patch)
      .where(and(eq(task.id, taskId), notDeleted(task)))
      .returning();
    return updated!;
  }

  /** The task's live label ids, sorted so they compare as a set. */
  async labelIdsOf(db: DbExecutor, taskId: string): Promise<string[]> {
    const rows = await db
      .select({ labelId: taskLabelLink.labelId })
      .from(taskLabelLink)
      .innerJoin(label, eq(label.id, taskLabelLink.labelId))
      .where(and(eq(taskLabelLink.taskId, taskId), notDeleted(taskLabelLink), notDeleted(label)));
    return rows.map((row) => row.labelId).sort();
  }

  /** Makes `labelIds` the task's labels: unlinks the others, links the missing ones. */
  async setLabels(tx: DbExecutor, taskId: string, labelIds: string[]): Promise<void> {
    await tx
      .update(taskLabelLink)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(taskLabelLink.taskId, taskId),
          notDeleted(taskLabelLink),
          labelIds.length > 0 ? notInArray(taskLabelLink.labelId, labelIds) : undefined,
        ),
      );
    if (labelIds.length === 0) return;
    await tx
      .insert(taskLabelLink)
      .values(labelIds.map((labelId) => ({ taskId, labelId })))
      .onConflictDoNothing({
        target: [taskLabelLink.taskId, taskLabelLink.labelId],
        where: sql`${taskLabelLink.deletedAt} is null`,
      });
  }

  async findPendingRequest(
    db: DbExecutor,
    taskId: string,
    where: { id: string } | { userId: string },
  ): Promise<TaskAssignmentRequestRow | undefined> {
    const [row] = await db
      .select()
      .from(taskAssignmentRequest)
      .where(
        and(
          eq(taskAssignmentRequest.taskId, taskId),
          'id' in where
            ? eq(taskAssignmentRequest.id, where.id)
            : eq(taskAssignmentRequest.userId, where.userId),
          eq(taskAssignmentRequest.status, 'pending'),
          notDeleted(taskAssignmentRequest),
        ),
      )
      .limit(1);
    return row;
  }

  async insertRequest(
    tx: DbExecutor,
    taskId: string,
    userId: string,
  ): Promise<TaskAssignmentRequestRow> {
    const [created] = await tx.insert(taskAssignmentRequest).values({ taskId, userId }).returning();
    return created!;
  }

  /**
   * Decides a pending request. Returns undefined when it was no longer pending (someone else
   * decided it meanwhile), so two concurrent decisions can't both win.
   */
  async setRequestStatus(
    tx: DbExecutor,
    requestId: string,
    status: Exclude<TaskAssignmentRequestStatus, 'pending'>,
  ): Promise<TaskAssignmentRequestRow | undefined> {
    const [updated] = await tx
      .update(taskAssignmentRequest)
      .set({ status })
      .where(
        and(eq(taskAssignmentRequest.id, requestId), eq(taskAssignmentRequest.status, 'pending')),
      )
      .returning();
    return updated;
  }

  /**
   * Assigns the member only if the task is still unassigned, as one statement: undefined when
   * someone else assigned it meanwhile.
   */
  async assignIfUnassigned(
    tx: DbExecutor,
    taskId: string,
    userId: string,
  ): Promise<TaskRow | undefined> {
    const [updated] = await tx
      .update(task)
      .set({ assigneeUserId: userId })
      .where(
        and(
          eq(task.id, taskId),
          notDeleted(task),
          isNull(task.assigneeUserId),
          isNull(task.assigneeName),
        ),
      )
      .returning();
    return updated;
  }

  /** Declines the task's pending requests (except one), returning them as they were. */
  async declinePendingRequests(
    tx: DbExecutor,
    taskId: string,
    exceptRequestId?: string,
  ): Promise<{ before: TaskAssignmentRequestRow; after: TaskAssignmentRequestRow }[]> {
    const pending = await tx
      .select()
      .from(taskAssignmentRequest)
      .where(
        and(
          eq(taskAssignmentRequest.taskId, taskId),
          eq(taskAssignmentRequest.status, 'pending'),
          notDeleted(taskAssignmentRequest),
          exceptRequestId ? ne(taskAssignmentRequest.id, exceptRequestId) : undefined,
        ),
      );
    const declined = [];
    for (const before of pending) {
      const after = await this.setRequestStatus(tx, before.id, 'declined');
      if (after) declined.push({ before, after });
    }
    return declined;
  }

  async isOrganizationMember(organizationId: string, userId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: member.id })
      .from(member)
      .where(and(eq(member.organizationId, organizationId), eq(member.userId, userId)))
      .limit(1);
    return row !== undefined;
  }

  /** The user's unfinished tasks per live event of the organization. */
  openTaskCounts(organizationId: string, userId: string) {
    return this.db
      .select({ eventId: event.id, eventName: event.name, openTasks: count() })
      .from(task)
      .innerJoin(event, eq(event.id, task.eventId))
      .where(
        and(
          eq(event.organizationId, organizationId),
          eq(task.assigneeUserId, userId),
          ne(task.status, 'done'),
          notDeleted(task),
          notDeleted(event),
          ne(event.status, 'archived'),
        ),
      )
      .groupBy(event.id, event.name, event.startsAt)
      .orderBy(asc(event.startsAt));
  }
}
