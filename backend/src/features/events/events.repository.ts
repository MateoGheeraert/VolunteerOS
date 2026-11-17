import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import type { CreateEventInput, UpdateEventInput } from './events.schemas.js';
import { and, asc, eq, exists } from 'drizzle-orm';
import type { Database } from '../../db/database.js';
import {
  event,
  eventMember,
  member,
  user,
  type EventMemberRole,
  type EventRow,
} from '../../db/schema/index.js';

/**
 * Data access for events. Every method takes the organization it works in, so a query can
 * never reach another tenant's rows. Authorization happens before these are called.
 */
@Injectable()
export class EventsRepository {
  constructor(@InjectDrizzle() private readonly db: Database) {}

  listForOrganization(organizationId: string): Promise<EventRow[]> {
    return this.db
      .select()
      .from(event)
      .where(eq(event.organizationId, organizationId))
      .orderBy(asc(event.startsAt));
  }

  listAssignedTo(organizationId: string, userId: string): Promise<EventRow[]> {
    return this.db
      .select()
      .from(event)
      .where(
        and(
          eq(event.organizationId, organizationId),
          exists(
            this.db
              .select()
              .from(eventMember)
              .where(and(eq(eventMember.eventId, event.id), eq(eventMember.userId, userId))),
          ),
        ),
      )
      .orderBy(asc(event.startsAt));
  }

  /** Creates the event and assigns its creator as manager, in one transaction. */
  createWithManager(
    organizationId: string,
    input: CreateEventInput,
    creatorUserId: string,
  ): Promise<EventRow> {
    return this.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(event)
        .values({
          organizationId,
          name: input.name,
          description: input.description ?? null,
          location: input.location ?? null,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
        })
        .returning();
      await tx.insert(eventMember).values({ eventId: created!.id, userId: creatorUserId });
      return created!;
    });
  }

  async update(
    organizationId: string,
    eventId: string,
    patch: Omit<UpdateEventInput, 'status'> & { status?: EventRow['status'] },
  ): Promise<EventRow> {
    const [updated] = await this.db
      .update(event)
      .set(patch)
      .where(and(eq(event.id, eventId), eq(event.organizationId, organizationId)))
      .returning();
    return updated!;
  }

  listMembers(organizationId: string, eventId: string) {
    return this.db
      .select({
        id: eventMember.id,
        eventId: eventMember.eventId,
        userId: eventMember.userId,
        role: eventMember.role,
        createdAt: eventMember.createdAt,
        name: user.name,
        email: user.email,
      })
      .from(eventMember)
      .innerJoin(event, eq(event.id, eventMember.eventId))
      .innerJoin(user, eq(user.id, eventMember.userId))
      .where(and(eq(eventMember.eventId, eventId), eq(event.organizationId, organizationId)))
      .orderBy(asc(eventMember.createdAt));
  }

  async isOrganizationMember(organizationId: string, userId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: member.id })
      .from(member)
      .where(and(eq(member.organizationId, organizationId), eq(member.userId, userId)))
      .limit(1);
    return row !== undefined;
  }

  /** Assigns the user, or updates their role if they already are. */
  async upsertMember(eventId: string, userId: string, role: EventMemberRole): Promise<void> {
    await this.db
      .insert(eventMember)
      .values({ eventId, userId, role })
      .onConflictDoUpdate({ target: [eventMember.eventId, eventMember.userId], set: { role } });
  }

  async removeMember(eventId: string, userId: string): Promise<boolean> {
    const deleted = await this.db
      .delete(eventMember)
      .where(and(eq(eventMember.eventId, eventId), eq(eventMember.userId, userId)))
      .returning({ id: eventMember.id });
    return deleted.length > 0;
  }
}
