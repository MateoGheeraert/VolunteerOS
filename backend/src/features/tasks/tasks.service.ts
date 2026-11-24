import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { recordActivity } from '../../activity/activity-log.js';
import type { EventAccess } from '../../authz/event-access.service.js';
import type { OrgContext } from '../../authz/org-context.js';
import type { Database, Transaction } from '../../db/database.js';
import type { EventRow, TaskAssignmentRequestRow, TaskRow } from '../../db/schema/index.js';
import { rethrowUnique } from '../../db/unique-violation.js';
import { isReadOnly } from '../events/event-status.js';
import { BudgetService } from '../budget/budget.service.js';
import { LabelsService } from '../labels/labels.service.js';
import { UploadsService } from '../uploads/uploads.service.js';
import { canSeeTask, isUnassigned, memberUpdateError } from './task-rules.js';
import { TasksRepository, type TaskValues, type TaskView } from './tasks.repository.js';
import type {
  CreateTaskInput,
  MyTasksDto,
  OpenTaskCountDto,
  TaskDto,
  UpdateTaskInput,
} from './tasks.schemas.js';

/**
 * Task fields whose values the activity log keeps. The title, the description and a typed-in
 * assignee name are free text: name only.
 */
const TASK_LOGGED_VALUES = [
  'status',
  'priority',
  'dueDate',
  'assigneeUserId',
  'createdByUserId',
  'labelIds',
] as const;
const REQUEST_LOGGED_VALUES = ['taskId', 'userId', 'status'] as const;

type LoggedTask = TaskRow & { labelIds: string[] };

/**
 * Business rules for an event's tasks and assignment requests (labels: `LabelsService`). Every write runs in a
 * transaction opened here and records its activity log entries in that same transaction.
 *
 * Routes have already authorized the event: 'manage' for managers-only writes, 'read' for what
 * members may do too (the rules below decide what that is).
 */
@Injectable()
export class TasksService {
  constructor(
    @InjectDrizzle() private readonly db: Database,
    private readonly tasks: TasksRepository,
    private readonly labels: LabelsService,
    private readonly uploads: UploadsService,
    private readonly budget: BudgetService,
  ) {}

  async list(org: OrgContext, access: EventAccess): Promise<TaskDto[]> {
    const views = await this.tasks.listViews(org.organizationId, {
      eventId: access.event.id,
      ...(access.canManage ? {} : { visibleTo: org.userId, requestsOf: org.userId }),
    });
    return views.map(toTaskDto);
  }

  /**
   * The caller's tasks across the organization's events (archived ones left out), with the
   * labels of those events. Being assigned is what makes them visible, also to members.
   */
  async listMine(org: OrgContext): Promise<MyTasksDto> {
    const views = await this.tasks.listViews(org.organizationId, {
      assignedTo: org.userId,
      requestsOf: org.userId,
    });
    const eventIds = [...new Set(views.map((view) => view.event.id))];
    const labels = await this.labels.list(eventIds);
    return {
      tasks: views.map((view) => ({
        ...toTaskDto(view),
        event: {
          id: view.event.id,
          name: view.event.name,
          status: view.event.status,
          startsAt: view.event.startsAt.toISOString(),
          endsAt: view.event.endsAt.toISOString(),
        },
      })),
      labels,
    };
  }

  async create(org: OrgContext, access: EventAccess, input: CreateTaskInput): Promise<TaskDto> {
    const created = await this.db.transaction((tx) =>
      this.createInTransaction(tx, org, access, input),
    );
    return this.view(org, access, created.id);
  }

  /**
   * Creates the task inside the caller's transaction, e.g. when accepting an AI suggestion, which
   * is marked accepted in the same one. Returns the row: the view can only be read after commit.
   */
  async createInTransaction(
    tx: Transaction,
    org: OrgContext,
    access: EventAccess,
    input: CreateTaskInput,
  ): Promise<TaskRow> {
    const eventId = access.event.id;
    assertWritable(access.event);
    if (input.assigneeUserId) await this.assertMember(org, input.assigneeUserId);
    const labelIds = await this.labels.assertLabels(eventId, input.labelIds ?? []);

    const row = await this.tasks.insertTask(tx, eventId, org.userId, {
      title: input.title,
      description: input.description || null,
      status: input.status ?? 'todo',
      priority: input.priority ?? 'medium',
      dueDate: input.dueDate ?? null,
      assigneeUserId: input.assigneeUserId ?? null,
      assigneeName: input.assigneeName ?? null,
    });
    await this.tasks.setLabels(tx, row.id, labelIds);
    await recordActivity(tx, org, {
      action: 'created',
      entityType: 'task',
      entity: { ...row, labelIds },
      before: null,
      eventId,
      values: TASK_LOGGED_VALUES,
    });
    return row;
  }

  /** Managers change anything; the assignee changes the status or gives the task back. */
  async update(
    org: OrgContext,
    access: EventAccess,
    taskId: string,
    input: UpdateTaskInput,
  ): Promise<TaskDto> {
    const eventId = access.event.id;
    assertWritable(access.event);
    const current = await this.findVisible(org, access, taskId);
    if (!access.canManage) {
      const error = memberUpdateError(org.userId, current, input);
      if (error) throw new ForbiddenException(error);
    }

    const { labelIds: newLabelIds, ...fields } = input;
    const patch: Partial<TaskValues> = { ...fields };
    if (fields.description !== undefined) patch.description = fields.description || null;
    // One assignee at a time: setting one kind clears the other.
    if (fields.assigneeUserId) patch.assigneeName = null;
    if (fields.assigneeName) patch.assigneeUserId = null;
    if (patch.assigneeUserId && patch.assigneeUserId !== current.assigneeUserId) {
      await this.assertMember(org, patch.assigneeUserId);
    }
    const labelIds = newLabelIds && (await this.labels.assertLabels(eventId, newLabelIds));

    await this.db.transaction(async (tx) => {
      const beforeLabels = await this.tasks.labelIdsOf(tx, taskId);
      const row =
        Object.keys(patch).length > 0 ? await this.tasks.updateTask(tx, taskId, patch) : current;
      if (labelIds) await this.tasks.setLabels(tx, taskId, labelIds);
      // A task given to someone no longer takes requests.
      if (isUnassigned(current) && !isUnassigned(row)) {
        await this.declineRequests(tx, org, eventId, taskId);
      }
      await recordActivity(tx, org, {
        action: 'updated',
        entityType: 'task',
        entity: { ...row, labelIds: labelIds ?? beforeLabels } satisfies LoggedTask,
        before: { ...current, labelIds: beforeLabels },
        eventId,
        values: TASK_LOGGED_VALUES,
      });
    });
    return this.view(org, access, taskId);
  }

  /**
   * Soft-deletes the task with its files, declines the requests for it, and unlinks it from
   * budget entries (which stay).
   */
  async remove(org: OrgContext, access: EventAccess, taskId: string): Promise<void> {
    const eventId = access.event.id;
    assertWritable(access.event);
    await this.findVisible(org, access, taskId);
    await this.db.transaction(async (tx) => {
      await this.declineRequests(tx, org, eventId, taskId);
      await this.uploads.removeForTask(tx, org, eventId, taskId);
      await this.budget.unlinkTask(tx, org, eventId, taskId);
      const row = await this.tasks.updateTask(tx, taskId, { deletedAt: new Date() });
      await recordActivity(tx, org, {
        action: 'deleted',
        entityType: 'task',
        entity: row,
        eventId,
      });
    });
  }

  /** A member asks to be assigned an unassigned task. */
  async requestAssignment(org: OrgContext, access: EventAccess, taskId: string): Promise<TaskDto> {
    const eventId = access.event.id;
    assertWritable(access.event);
    const current = await this.findVisible(org, access, taskId);
    if (!isUnassigned(current)) {
      throw new ConflictException('The task is already assigned');
    }
    await this.db
      .transaction(async (tx) => {
        const request = await this.tasks.insertRequest(tx, taskId, org.userId);
        await recordActivity(tx, org, {
          action: 'requested',
          entityType: 'task_assignment_request',
          entity: request,
          before: null,
          eventId,
          values: REQUEST_LOGGED_VALUES,
        });
      })
      .catch((error: unknown) =>
        rethrowUnique(error, 'task_assignment_request_pending_uidx', 'You already asked for it'),
      );
    return this.view(org, access, taskId);
  }

  async cancelRequest(org: OrgContext, access: EventAccess, taskId: string): Promise<void> {
    assertWritable(access.event);
    await this.findVisible(org, access, taskId);
    await this.db.transaction(async (tx) => {
      const request = await this.tasks.findPendingRequest(tx, taskId, { userId: org.userId });
      if (!request) throw new NotFoundException('You have no open request for this task');
      await this.decide(tx, org, access.event.id, request, 'cancelled');
    });
  }

  /** Assigns the requester and declines everyone else's requests. */
  async approveRequest(
    org: OrgContext,
    access: EventAccess,
    taskId: string,
    requestId: string,
  ): Promise<TaskDto> {
    const eventId = access.event.id;
    assertWritable(access.event);
    const current = await this.findVisible(org, access, taskId);
    await this.db.transaction(async (tx) => {
      const request = await this.tasks.findPendingRequest(tx, taskId, { id: requestId });
      if (!request) throw new NotFoundException('Request not found');
      if (!isUnassigned(current)) {
        throw new ConflictException('The task is already assigned');
      }
      if (!(await this.tasks.isOrganizationMember(org.organizationId, request.userId))) {
        throw new ConflictException('The requester is no longer a member of this organization');
      }
      // Both writes are conditional, so a second approval racing this one gets a 409.
      await this.decide(tx, org, eventId, request, 'approved');
      const row = await this.tasks.assignIfUnassigned(tx, taskId, request.userId);
      if (!row) throw new ConflictException('The task is already assigned');
      const labelIds = await this.tasks.labelIdsOf(tx, taskId);
      await recordActivity(tx, org, {
        action: 'updated',
        entityType: 'task',
        entity: { ...row, labelIds } satisfies LoggedTask,
        before: { ...current, labelIds },
        eventId,
        values: TASK_LOGGED_VALUES,
      });
      await this.declineRequests(tx, org, eventId, taskId);
    });
    return this.view(org, access, taskId);
  }

  async declineRequest(
    org: OrgContext,
    access: EventAccess,
    taskId: string,
    requestId: string,
  ): Promise<void> {
    assertWritable(access.event);
    await this.findVisible(org, access, taskId);
    await this.db.transaction(async (tx) => {
      const request = await this.tasks.findPendingRequest(tx, taskId, { id: requestId });
      if (!request) throw new NotFoundException('Request not found');
      await this.decide(tx, org, access.event.id, request, 'declined');
    });
  }

  /** What removing the member from the organization would release, per event. */
  async openTaskCounts(org: OrgContext, userId: string): Promise<OpenTaskCountDto[]> {
    return this.tasks.openTaskCounts(org.organizationId, userId);
  }

  /** The task, if the caller may see it; 404 otherwise, so hidden tasks don't leak. */
  private async findVisible(
    org: OrgContext,
    access: EventAccess,
    taskId: string,
  ): Promise<TaskRow> {
    const row = await this.tasks.findTask(access.event.id, taskId);
    if (!row || !canSeeTask({ userId: org.userId, canManage: access.canManage }, row)) {
      throw new NotFoundException('Task not found');
    }
    return row;
  }

  private async view(org: OrgContext, access: EventAccess, taskId: string): Promise<TaskDto> {
    const [view] = await this.tasks.listViews(org.organizationId, {
      eventId: access.event.id,
      taskId,
      requestsOf: access.canManage ? undefined : org.userId,
    });
    if (!view) throw new NotFoundException('Task not found');
    return toTaskDto(view);
  }

  private async assertMember(org: OrgContext, userId: string): Promise<void> {
    if (!(await this.tasks.isOrganizationMember(org.organizationId, userId))) {
      throw new BadRequestException('assigneeUserId: not a member of this organization');
    }
  }

  private async decide(
    tx: Transaction,
    org: OrgContext,
    eventId: string,
    request: TaskAssignmentRequestRow,
    status: 'approved' | 'declined' | 'cancelled',
  ): Promise<void> {
    const row = await this.tasks.setRequestStatus(tx, request.id, status);
    if (!row) throw new ConflictException('The request was already handled');
    await recordActivity(tx, org, {
      action: status,
      entityType: 'task_assignment_request',
      entity: row,
      before: request,
      eventId,
      values: REQUEST_LOGGED_VALUES,
    });
  }

  private async declineRequests(
    tx: Transaction,
    org: OrgContext,
    eventId: string,
    taskId: string,
  ): Promise<void> {
    for (const { before, after } of await this.tasks.declinePendingRequests(tx, taskId)) {
      await recordActivity(tx, org, {
        action: 'declined',
        entityType: 'task_assignment_request',
        entity: after,
        before,
        eventId,
        values: REQUEST_LOGGED_VALUES,
      });
    }
  }
}

/** Archived events are read-only, their tasks included. */
function assertWritable(event: EventRow): void {
  if (isReadOnly(event.status)) {
    throw new ConflictException('An archived event cannot be changed');
  }
}

export function toTaskDto(view: TaskView): TaskDto {
  const { task } = view;
  let assignee: TaskDto['assignee'] = null;
  if (task.assigneeUserId) {
    assignee = {
      type: 'member',
      userId: task.assigneeUserId,
      name: view.assigneeUserName ?? '',
      active: view.assigneeActive,
    };
  } else if (task.assigneeName) {
    assignee = { type: 'external', name: task.assigneeName };
  }
  return {
    id: task.id,
    eventId: task.eventId,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    dueDate: task.dueDate,
    assignee,
    createdBy: {
      userId: task.createdByUserId,
      name: view.creatorName,
      active: view.creatorActive,
    },
    labelIds: view.labelIds,
    pendingRequests: view.pendingRequests.map((request) => ({
      ...request,
      createdAt: request.createdAt.toISOString(),
    })),
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}
