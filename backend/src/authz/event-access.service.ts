import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, eq } from 'drizzle-orm';
import type { Database } from '../db/database.js';
import { notDeleted } from '../db/soft-delete.js';
import { event, eventMember, type EventMemberRole, type EventRow } from '../db/schema/index.js';
import type { OrgContext } from './org-context.js';
import { canAccessEvent, type EventAction } from './policies.js';

/** An authorized event, and what the caller may do with it beyond the checked action. */
export interface EventAccess {
  event: EventRow;
  /** The caller's assignment on the event, or null when they have none. */
  eventRole: EventMemberRole | null;
  /** Whether the caller may manage the event (admins, owners and its managers). */
  canManage: boolean;
}

@Injectable()
export class EventAccessService {
  constructor(@InjectDrizzle() private readonly db: Database) {}

  /**
   * Loads an event of the caller's organization and checks the action against the policy.
   * Events of other organizations answer 404 so their existence doesn't leak. Every member
   * sees every event of their own organization, so a forbidden action answers 403.
   */
  async assertCan(org: OrgContext, action: EventAction, eventId: string): Promise<EventAccess> {
    const [row] = await this.db
      .select({ event, eventRole: eventMember.role })
      .from(event)
      .leftJoin(
        eventMember,
        // A removed (soft-deleted) assignment grants nothing.
        and(
          eq(eventMember.eventId, event.id),
          eq(eventMember.userId, org.userId),
          notDeleted(eventMember),
        ),
      )
      .where(
        and(eq(event.id, eventId), eq(event.organizationId, org.organizationId), notDeleted(event)),
      )
      .limit(1);

    if (!row) {
      throw new NotFoundException('Event not found');
    }
    const subject = { orgRole: org.role, eventRole: row.eventRole };
    if (!canAccessEvent(subject, action)) {
      throw new ForbiddenException();
    }
    return {
      event: row.event,
      eventRole: row.eventRole,
      canManage: canAccessEvent(subject, 'manage'),
    };
  }
}
