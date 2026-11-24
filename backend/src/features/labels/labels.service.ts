import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { recordActivity } from '../../activity/activity-log.js';
import type { EventAccess } from '../../authz/event-access.service.js';
import type { OrgContext } from '../../authz/org-context.js';
import type { Database } from '../../db/database.js';
import type { EventRow, LabelRow } from '../../db/schema/index.js';
import { rethrowUnique } from '../../db/unique-violation.js';
import { isReadOnly } from '../events/event-status.js';
import { LabelsRepository } from './labels.repository.js';
import type {
  CreateLabelInput,
  LabelDto,
  LabelUsageDto,
  UpdateLabelInput,
} from './labels.schemas.js';

/** Label names are categories ("Bar", "Catering"), not personal data. */
const LABEL_LOGGED_VALUES = ['name', 'color'] as const;

/**
 * An event's labels, shared by its tasks and budget entries. Every write runs in a transaction
 * and records its activity log entry in that same transaction. Routes have already authorized
 * the event.
 */
@Injectable()
export class LabelsService {
  constructor(
    @InjectDrizzle() private readonly db: Database,
    private readonly labels: LabelsRepository,
  ) {}

  async list(eventIds: string[]): Promise<LabelDto[]> {
    return (await this.labels.list(eventIds)).map(toLabelDto);
  }

  async create(org: OrgContext, access: EventAccess, input: CreateLabelInput): Promise<LabelDto> {
    const eventId = access.event.id;
    assertWritable(access.event);
    const created = await this.db
      .transaction(async (tx) => {
        const row = await this.labels.insert(tx, eventId, input);
        await recordActivity(tx, org, {
          action: 'created',
          entityType: 'label',
          entity: row,
          before: null,
          eventId,
          values: LABEL_LOGGED_VALUES,
        });
        return row;
      })
      .catch(rethrowNameTaken);
    return toLabelDto(created);
  }

  async update(
    org: OrgContext,
    access: EventAccess,
    labelId: string,
    input: UpdateLabelInput,
  ): Promise<LabelDto> {
    const eventId = access.event.id;
    assertWritable(access.event);
    const current = await this.find(eventId, labelId);
    if (Object.keys(input).length === 0) return toLabelDto(current);
    const updated = await this.db
      .transaction(async (tx) => {
        const row = await this.labels.update(tx, labelId, input);
        await recordActivity(tx, org, {
          action: 'updated',
          entityType: 'label',
          entity: row,
          before: current,
          eventId,
          values: LABEL_LOGGED_VALUES,
        });
        return row;
      })
      .catch(rethrowNameTaken);
    return toLabelDto(updated);
  }

  /** What carries the label, so the app can say what deleting it touches. */
  async usage(access: EventAccess, labelId: string): Promise<LabelUsageDto> {
    await this.find(access.event.id, labelId);
    return this.labels.usage(labelId);
  }

  /** Soft-deletes the label and takes it off every task and budget entry. */
  async remove(org: OrgContext, access: EventAccess, labelId: string): Promise<void> {
    const eventId = access.event.id;
    assertWritable(access.event);
    await this.find(eventId, labelId);
    await this.db.transaction(async (tx) => {
      await this.labels.unlinkEverywhere(tx, labelId);
      const row = await this.labels.update(tx, labelId, { deletedAt: new Date() });
      await recordActivity(tx, org, {
        action: 'deleted',
        entityType: 'label',
        entity: row,
        eventId,
      });
    });
  }

  /** The distinct, sorted label ids, after checking they are live labels of the event. */
  async assertLabels(eventId: string, labelIds: string[]): Promise<string[]> {
    const unique = [...new Set(labelIds)].sort();
    if ((await this.labels.count(eventId, unique)) !== unique.length) {
      throw new BadRequestException('labelIds: unknown label');
    }
    return unique;
  }

  private async find(eventId: string, labelId: string): Promise<LabelRow> {
    const row = await this.labels.find(eventId, labelId);
    if (!row) throw new NotFoundException('Label not found');
    return row;
  }
}

/** Archived events are read-only, their labels included. */
function assertWritable(event: EventRow): void {
  if (isReadOnly(event.status)) {
    throw new ConflictException('An archived event cannot be changed');
  }
}

const rethrowNameTaken = (error: unknown): never =>
  rethrowUnique(error, 'label_event_name_uidx', 'name: a label with this name already exists');

export const toLabelDto = (row: LabelRow): LabelDto => ({
  id: row.id,
  eventId: row.eventId,
  name: row.name,
  color: row.color,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});
