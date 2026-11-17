import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import type {
  AddEventMemberInput,
  CreateEventInput,
  EventDetailDto,
  EventDto,
  EventMemberDto,
  UpdateEventInput,
} from './events.schemas.js';
import { recordActivity } from '../../activity/activity-log.js';
import type { Database } from '../../db/database.js';
import type { EventRow } from '../../db/schema/index.js';
import type { OrgContext } from '../../authz/org-context.js';
import { isOrgAdmin } from '../../authz/policies.js';
import { canArchive, canTransition, isReadOnly } from './event-status.js';
import { EventsRepository, type EditionRef, type EventViewer } from './events.repository.js';

/**
 * Event fields whose values the activity log keeps. `description` and `retrospective` are free
 * text: name only.
 */
const EVENT_LOGGED_VALUES = [
  'name',
  'eventType',
  'location',
  'startsAt',
  'endsAt',
  'status',
  'previousEditionId',
  'expectedAttendance',
  'actualAttendance',
] as const;
/** A manager assignment's user is stored by id only. */
const MEMBER_LOGGED_VALUES = ['userId', 'role'] as const;

/**
 * Business rules for events. Every write runs in a transaction opened here, and records its
 * activity log entry in that same transaction.
 */
@Injectable()
export class EventsService {
  constructor(
    @InjectDrizzle() private readonly db: Database,
    private readonly events: EventsRepository,
  ) {}

  async list(org: OrgContext): Promise<EventDto[]> {
    const rows = isOrgAdmin(org.role)
      ? await this.events.listForOrganization(org.organizationId)
      : await this.events.listAssignedTo(org.organizationId, org.userId);
    return rows.map(toEventDto);
  }

  /** The event with the editions before and after it that the caller may see. */
  async get(org: OrgContext, current: EventRow): Promise<EventDetailDto> {
    const { previous, next } = await this.events.findNeighbourEditions(
      org.organizationId,
      current,
      viewerOf(org),
    );
    return {
      ...toEventDto(current),
      previousEdition: previous && toEditionRefDto(previous),
      nextEdition: next && toEditionRefDto(next),
    };
  }

  /** Creates the event and assigns its creator as manager. */
  async create(org: OrgContext, input: CreateEventInput): Promise<EventDto> {
    if (input.previousEditionId) {
      await this.assertCanContinue(org, input.previousEditionId, input.startsAt);
    }
    const created = await this.db.transaction(async (tx) => {
      const row = await this.events.insert(tx, org.organizationId, input);
      const manager = await this.events.insertMember(tx, row.id, org.userId, 'manager');
      await recordActivity(tx, org, {
        action: 'created',
        entityType: 'event',
        entity: row,
        before: null,
        eventId: row.id,
        values: EVENT_LOGGED_VALUES,
      });
      await recordActivity(tx, org, {
        action: 'member_added',
        entityType: 'event_member',
        entity: manager,
        before: null,
        eventId: row.id,
        values: MEMBER_LOGGED_VALUES,
      });
      return row;
    });
    return toEventDto(created);
  }

  /** `current` has already been authorized for 'manage' by the route. */
  async update(org: OrgContext, current: EventRow, input: UpdateEventInput): Promise<EventDto> {
    if (isReadOnly(current.status)) {
      throw new ConflictException('An archived event cannot be changed');
    }
    if (input.status && !canTransition(current.status, input.status)) {
      throw new ConflictException(`Cannot change status from ${current.status} to ${input.status}`);
    }
    // The schema checks the pair when both dates are sent; check against the stored one otherwise.
    const startsAt = input.startsAt ?? current.startsAt;
    const endsAt = input.endsAt ?? current.endsAt;
    if (endsAt <= startsAt) {
      throw new BadRequestException('endsAt must be after startsAt');
    }
    await this.assertEditionOrder(org, current, startsAt, input.previousEditionId);
    const updated = await this.db.transaction(async (tx) => {
      const row = await this.events.update(tx, org.organizationId, current.id, input);
      await recordActivity(tx, org, {
        action: 'updated',
        entityType: 'event',
        entity: row,
        before: current,
        eventId: row.id,
        values: EVENT_LOGGED_VALUES,
      });
      return row;
    });
    return toEventDto(updated);
  }

  /**
   * Checks the event may continue `previousEditionId`: a live, earlier event of the organization
   * that the caller may see, and that no other event continues yet. Messages start with the field
   * so the form can mark it.
   */
  private async assertCanContinue(
    org: OrgContext,
    previousEditionId: string,
    startsAt: Date,
    eventId?: string,
  ): Promise<void> {
    const previous = await this.events.findEdition(
      org.organizationId,
      previousEditionId,
      viewerOf(org),
    );
    if (!previous) {
      throw new BadRequestException('previousEditionId: event not found');
    }
    if (previous.startsAt >= startsAt) {
      throw new BadRequestException('previousEditionId: must start before this event');
    }
    if (await this.events.findSuccessor(org.organizationId, previous.id, eventId)) {
      throw new BadRequestException('previousEditionId: already continued by another event');
    }
  }

  /**
   * On update: a new previous edition gets the full check, and a changed start must stay after the
   * previous edition and before the next one. Editions stay in date order, so there are no cycles.
   */
  private async assertEditionOrder(
    org: OrgContext,
    current: EventRow,
    startsAt: Date,
    previousEditionId: string | null | undefined,
  ): Promise<void> {
    const linkChanged =
      previousEditionId !== undefined && previousEditionId !== current.previousEditionId;
    if (linkChanged && previousEditionId) {
      await this.assertCanContinue(org, previousEditionId, startsAt, current.id);
    }
    if (startsAt.getTime() === current.startsAt.getTime()) return;

    const previousId = linkChanged ? null : current.previousEditionId;
    // The kept link may point at an event the caller can't see: the dates still have to hold.
    const previous = previousId && (await this.events.findEdition(org.organizationId, previousId));
    if (previous && previous.startsAt >= startsAt) {
      throw new BadRequestException('startsAt: must be after the previous edition starts');
    }
    const next = await this.events.findSuccessor(org.organizationId, current.id);
    if (next && next.startsAt <= startsAt) {
      throw new BadRequestException('startsAt: must be before the next edition starts');
    }
  }

  async archive(org: OrgContext, current: EventRow): Promise<EventDto> {
    if (!canArchive(current.status)) {
      throw new ConflictException('The event is already archived');
    }
    const archived = await this.db.transaction(async (tx) => {
      const row = await this.events.update(tx, org.organizationId, current.id, {
        status: 'archived',
      });
      await recordActivity(tx, org, {
        action: 'archived',
        entityType: 'event',
        entity: row,
        before: current,
        eventId: row.id,
        values: EVENT_LOGGED_VALUES,
      });
      return row;
    });
    return toEventDto(archived);
  }

  async listMembers(org: OrgContext, eventId: string): Promise<EventMemberDto[]> {
    const rows = await this.events.listMembers(org.organizationId, eventId);
    return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
  }

  /** Assigns the user, or changes their role if they already are. */
  async addMember(org: OrgContext, eventId: string, input: AddEventMemberInput): Promise<void> {
    // Only people already in the organization can be assigned to its events.
    if (!(await this.events.isOrganizationMember(org.organizationId, input.userId))) {
      throw new BadRequestException('The user is not a member of this organization');
    }
    const role = input.role ?? 'manager';
    await this.db.transaction(async (tx) => {
      const existing = await this.events.findActiveMember(tx, eventId, input.userId);
      if (!existing) {
        const added = await this.events.insertMember(tx, eventId, input.userId, role);
        await recordActivity(tx, org, {
          action: 'member_added',
          entityType: 'event_member',
          entity: added,
          before: null,
          eventId,
          values: MEMBER_LOGGED_VALUES,
        });
        return;
      }
      if (existing.role === role) return;
      const updated = await this.events.updateMemberRole(tx, existing.id, role);
      await recordActivity(tx, org, {
        action: 'role_changed',
        entityType: 'event_member',
        entity: updated,
        before: existing,
        eventId,
        values: MEMBER_LOGGED_VALUES,
      });
    });
  }

  async removeMember(org: OrgContext, eventId: string, userId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const removed = await this.events.removeMember(tx, eventId, userId);
      if (!removed) {
        throw new NotFoundException('The user is not assigned to this event');
      }
      await recordActivity(tx, org, {
        action: 'member_removed',
        entityType: 'event_member',
        entity: removed,
        eventId,
      });
    });
  }
}

const viewerOf = (org: OrgContext): EventViewer => ({
  userId: org.userId,
  seesAllEvents: isOrgAdmin(org.role),
});

const toEditionRefDto = (ref: EditionRef) => ({
  id: ref.id,
  name: ref.name,
  startsAt: ref.startsAt.toISOString(),
});

export function toEventDto(row: EventRow): EventDto {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    eventType: row.eventType,
    description: row.description,
    location: row.location,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    status: row.status,
    previousEditionId: row.previousEditionId,
    expectedAttendance: row.expectedAttendance,
    actualAttendance: row.actualAttendance,
    retrospective: row.retrospective,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
