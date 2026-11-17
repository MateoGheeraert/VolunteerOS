import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, eq } from 'drizzle-orm';
import type { Database } from '../db/database.js';
import { event, eventMember, type EventRow } from '../db/schema/index.js';
import type { OrgContext } from './org-context.js';
import { canAccessEvent, canSeeEvent, type EventAction } from './policies.js';

@Injectable()
export class EventAccessService {
  constructor(@InjectDrizzle() private readonly db: Database) {}

  /**
   * Loads an event of the caller's organization and checks the action against the policy.
   * Events of other organizations, and events the caller may not see, answer 404 so their
   * existence doesn't leak. A visible event with a forbidden action answers 403.
   */
  async assertCan(org: OrgContext, action: EventAction, eventId: string): Promise<EventRow> {
    const [row] = await this.db
      .select({ event, eventRole: eventMember.role })
      .from(event)
      .leftJoin(
        eventMember,
        and(eq(eventMember.eventId, event.id), eq(eventMember.userId, org.userId)),
      )
      .where(and(eq(event.id, eventId), eq(event.organizationId, org.organizationId)))
      .limit(1);

    const subject = { orgRole: org.role, eventRole: row?.eventRole ?? null };
    if (!row || !canSeeEvent(subject)) {
      throw new NotFoundException('Event not found');
    }
    if (!canAccessEvent(subject, action)) {
      throw new ForbiddenException();
    }
    return row.event;
  }
}
