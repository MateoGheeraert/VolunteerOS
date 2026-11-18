import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, eq } from 'drizzle-orm';
import type { Database } from '../db/database.js';
import { notDeleted } from '../db/soft-delete.js';
import { event, eventMember, type EventRow } from '../db/schema/index.js';
import type { OrgContext } from './org-context.js';
import { canAccessEvent, type EventAction } from './policies.js';

@Injectable()
export class EventAccessService {
  constructor(@InjectDrizzle() private readonly db: Database) {}

  /**
   * Loads an event of the caller's organization and checks the action against the policy.
   * Events of other organizations answer 404 so their existence doesn't leak. Every member
   * sees every event of their own organization, so a forbidden action answers 403.
   */
  async assertCan(org: OrgContext, action: EventAction, eventId: string): Promise<EventRow> {
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
    if (!canAccessEvent({ orgRole: org.role, eventRole: row.eventRole }, action)) {
      throw new ForbiddenException();
    }
    return row.event;
  }
}
