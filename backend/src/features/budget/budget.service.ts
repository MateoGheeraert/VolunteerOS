import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { recordActivity, type ActivityScope } from '../../activity/activity-log.js';
import type { EventAccess } from '../../authz/event-access.service.js';
import type { OrgContext } from '../../authz/org-context.js';
import type { Database, Transaction } from '../../db/database.js';
import type { BudgetEntryRow, EventRow } from '../../db/schema/index.js';
import { isReadOnly } from '../events/event-status.js';
import { LabelsService } from '../labels/labels.service.js';
import { canSeeTask, type TaskViewer } from '../tasks/task-rules.js';
import { UploadsService } from '../uploads/uploads.service.js';
import {
  BudgetRepository,
  type BudgetEntryValues,
  type BudgetEntryView,
} from './budget.repository.js';
import {
  AMOUNT_REQUIRED,
  hasAmount,
  type BudgetEntryDto,
  type CreateBudgetEntryInput,
  type UpdateBudgetEntryInput,
} from './budget.schemas.js';

/**
 * Budget entry fields whose values the activity log keeps: amounts and links. The title and the
 * notes are free text: name only.
 */
const ROW_LOGGED_VALUES = [
  'type',
  'estimatedCents',
  'actualCents',
  'taskId',
  'createdByUserId',
] as const;
const ENTRY_LOGGED_VALUES = [...ROW_LOGGED_VALUES, 'labelIds'] as const;

type LoggedEntry = BudgetEntryRow & { labelIds: string[] };

/**
 * An event's budget: expected and actual income and expenses. Every org member reads it;
 * managers write it (the routes check that). Every write runs in a transaction and records its
 * activity log entries in that same transaction. Archived events are read-only.
 */
@Injectable()
export class BudgetService {
  constructor(
    @InjectDrizzle() private readonly db: Database,
    private readonly budget: BudgetRepository,
    private readonly labels: LabelsService,
    private readonly uploads: UploadsService,
  ) {}

  async list(org: OrgContext, access: EventAccess): Promise<BudgetEntryDto[]> {
    const views = await this.budget.listViews(access.event.id);
    return views.map((view) => toBudgetEntryDto(viewerOf(org, access), view));
  }

  async create(
    org: OrgContext,
    access: EventAccess,
    input: CreateBudgetEntryInput,
  ): Promise<BudgetEntryDto> {
    const eventId = access.event.id;
    assertWritable(access.event);
    if (input.taskId) await this.assertTask(eventId, input.taskId);
    const labelIds = await this.labels.assertLabels(eventId, input.labelIds ?? []);

    const created = await this.db.transaction(async (tx) => {
      const row = await this.budget.insert(tx, eventId, org.userId, {
        type: input.type,
        title: input.title,
        estimatedCents: input.estimatedCents ?? null,
        actualCents: input.actualCents ?? null,
        notes: input.notes || null,
        taskId: input.taskId ?? null,
      });
      await this.budget.setLabels(tx, row.id, labelIds);
      await recordActivity(tx, org, {
        action: 'created',
        entityType: 'budget_entry',
        entity: { ...row, labelIds } satisfies LoggedEntry,
        before: null,
        eventId,
        values: ENTRY_LOGGED_VALUES,
      });
      return row;
    });
    return this.view(org, access, created.id);
  }

  async update(
    org: OrgContext,
    access: EventAccess,
    entryId: string,
    input: UpdateBudgetEntryInput,
  ): Promise<BudgetEntryDto> {
    const eventId = access.event.id;
    assertWritable(access.event);
    const current = await this.find(eventId, entryId);

    const { labelIds: newLabelIds, ...fields } = input;
    const patch: Partial<BudgetEntryValues> = { ...fields };
    if (fields.notes !== undefined) patch.notes = fields.notes || null;
    if (!hasAmount({ ...current, ...patch })) throw new BadRequestException(AMOUNT_REQUIRED);
    if (patch.taskId && patch.taskId !== current.taskId) {
      await this.assertTask(eventId, patch.taskId);
    }
    const labelIds = newLabelIds && (await this.labels.assertLabels(eventId, newLabelIds));

    await this.db.transaction(async (tx) => {
      const beforeLabels = await this.budget.labelIdsOf(tx, entryId);
      const labelsChanged = labelIds !== undefined && labelIds.join() !== beforeLabels.join();
      let row = current;
      if (Object.keys(patch).length > 0) row = await this.budget.update(tx, entryId, patch);
      // Labels live in their own table: a labels-only change still marks the entry as updated,
      // so clients see that it changed.
      else if (labelsChanged) row = await this.budget.touch(tx, entryId);
      if (labelIds) await this.budget.setLabels(tx, entryId, labelIds);
      await recordActivity(tx, org, {
        action: 'updated',
        entityType: 'budget_entry',
        entity: { ...row, labelIds: labelIds ?? beforeLabels } satisfies LoggedEntry,
        before: { ...current, labelIds: beforeLabels },
        eventId,
        values: ENTRY_LOGGED_VALUES,
      });
    });
    return this.view(org, access, entryId);
  }

  /** Soft-deletes the entry with its files. */
  async remove(org: OrgContext, access: EventAccess, entryId: string): Promise<void> {
    const eventId = access.event.id;
    assertWritable(access.event);
    await this.find(eventId, entryId);
    await this.db.transaction(async (tx) => {
      await this.uploads.removeForBudgetEntry(tx, org, eventId, entryId);
      const row = await this.budget.update(tx, entryId, { deletedAt: new Date() });
      await recordActivity(tx, org, {
        action: 'deleted',
        entityType: 'budget_entry',
        entity: row,
        eventId,
      });
    });
  }

  /**
   * A task is being deleted, in the task's transaction: its budget entries stay, without the
   * link. Each changed entry is logged.
   */
  async unlinkTask(
    tx: Transaction,
    scope: ActivityScope,
    eventId: string,
    taskId: string,
  ): Promise<void> {
    for (const { before, after } of await this.budget.unlinkTask(tx, taskId)) {
      await recordActivity(tx, scope, {
        action: 'updated',
        entityType: 'budget_entry',
        entity: after,
        before,
        eventId,
        values: ROW_LOGGED_VALUES,
      });
    }
  }

  private async view(org: OrgContext, access: EventAccess, entryId: string) {
    const [view] = await this.budget.listViews(access.event.id, entryId);
    if (!view) throw new NotFoundException('Budget entry not found');
    return toBudgetEntryDto(viewerOf(org, access), view);
  }

  private async find(eventId: string, entryId: string): Promise<BudgetEntryRow> {
    const row = await this.budget.find(eventId, entryId);
    if (!row) throw new NotFoundException('Budget entry not found');
    return row;
  }

  private async assertTask(eventId: string, taskId: string): Promise<void> {
    if (!(await this.budget.isEventTask(eventId, taskId))) {
      throw new BadRequestException('taskId: not a task of this event');
    }
  }
}

const viewerOf = (org: OrgContext, access: EventAccess): TaskViewer => ({
  userId: org.userId,
  canManage: access.canManage,
});

/** Archived events are read-only, their budget included. */
function assertWritable(event: EventRow): void {
  if (isReadOnly(event.status)) {
    throw new ConflictException('An archived event cannot be changed');
  }
}

/** The linked task shows only to whoever may see it, like everywhere else. */
export function toBudgetEntryDto(viewer: TaskViewer, view: BudgetEntryView): BudgetEntryDto {
  const { entry } = view;
  const task = view.task && canSeeTask(viewer, view.task) ? view.task : null;
  return {
    id: entry.id,
    eventId: entry.eventId,
    type: entry.type,
    title: entry.title,
    estimatedCents: entry.estimatedCents,
    actualCents: entry.actualCents,
    notes: entry.notes,
    task: task ? { id: task.id, title: task.title } : null,
    labelIds: view.labelIds,
    fileCount: view.fileCount,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
}
