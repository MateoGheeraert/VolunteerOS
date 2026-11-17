import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  AddEventMemberInput,
  CreateEventInput,
  EventDto,
  EventMemberDto,
  UpdateEventInput,
} from './events.schemas.js';
import type { EventRow } from '../../db/schema/index.js';
import type { OrgContext } from '../../authz/org-context.js';
import { isOrgAdmin } from '../../authz/policies.js';
import { canArchive, canTransition, isReadOnly } from './event-status.js';
import { EventsRepository } from './events.repository.js';

@Injectable()
export class EventsService {
  constructor(private readonly events: EventsRepository) {}

  async list(org: OrgContext): Promise<EventDto[]> {
    const rows = isOrgAdmin(org.role)
      ? await this.events.listForOrganization(org.organizationId)
      : await this.events.listAssignedTo(org.organizationId, org.userId);
    return rows.map(toEventDto);
  }

  async create(org: OrgContext, input: CreateEventInput): Promise<EventDto> {
    return toEventDto(await this.events.createWithManager(org.organizationId, input, org.userId));
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
    return toEventDto(await this.events.update(org.organizationId, current.id, input));
  }

  async archive(org: OrgContext, current: EventRow): Promise<EventDto> {
    if (!canArchive(current.status)) {
      throw new ConflictException('The event is already archived');
    }
    return toEventDto(
      await this.events.update(org.organizationId, current.id, { status: 'archived' }),
    );
  }

  async listMembers(org: OrgContext, eventId: string): Promise<EventMemberDto[]> {
    const rows = await this.events.listMembers(org.organizationId, eventId);
    return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
  }

  async addMember(org: OrgContext, eventId: string, input: AddEventMemberInput): Promise<void> {
    // Only people already in the organization can be assigned to its events.
    if (!(await this.events.isOrganizationMember(org.organizationId, input.userId))) {
      throw new BadRequestException('The user is not a member of this organization');
    }
    await this.events.upsertMember(eventId, input.userId, input.role ?? 'manager');
  }

  async removeMember(eventId: string, userId: string): Promise<void> {
    if (!(await this.events.removeMember(eventId, userId))) {
      throw new NotFoundException('The user is not assigned to this event');
    }
  }
}

export function toEventDto(row: EventRow): EventDto {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    description: row.description,
    location: row.location,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
