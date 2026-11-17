import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import type { CreateEventInput, UpdateEventInput } from './events.schemas.js';
import { and, asc, eq, exists } from 'drizzle-orm';
import type { Database, DbExecutor } from '../../db/database.js';
import {
  event,
  eventMember,
  member,
  user,
  type EventMemberRole,
  type EventMemberRow,
  type EventRow,
} from '../../db/schema/index.js';
import { notDeleted } from '../../db/soft-delete.js';

/**
 * Data access for events. Every method takes the organization it works in, so a query can
 * never reach another tenant's rows. Authorization happens before these are called.
 *
 * Writes take a `tx`: the service opens the transaction, so the activity log entry is written
 * in the same one. Reads skip soft-deleted rows.
 */
@Injectable()
export class EventsRepository {
  constructor(@InjectDrizzle() private readonly db: Database) {}

  listForOrganization(organizationId: string): Promise<EventRow[]> {
    return this.db
      .select()
      .from(event)
      .where(and(eq(event.organizationId, organizationId), notDeleted(event)))
      .orderBy(asc(event.startsAt));
  }

  listAssignedTo(organizationId: string, userId: string): Promise<EventRow[]> {
    return this.db
      .select()
      .from(event)
      .where(
        and(
          eq(event.organizationId, organizationId),
          notDeleted(event),
          exists(
            this.db
              .select()
              .from(eventMember)
              .where(
                and(
                  eq(eventMember.eventId, event.id),
                  eq(eventMember.userId, userId),
                  notDeleted(eventMember),
                ),
              ),
          ),
        ),
      )
      .orderBy(asc(event.startsAt));
  }

  async insert(tx: DbExecutor, organizationId: string, input: CreateEventInput): Promise<EventRow> {
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
    return created!;
  }

  async update(
    tx: DbExecutor,
    organizationId: string,
    eventId: string,
    patch: Omit<UpdateEventInput, 'status'> & { status?: EventRow['status'] },
  ): Promise<EventRow> {
    const [updated] = await tx
      .update(event)
      .set(patch)
      .where(
        and(eq(event.id, eventId), eq(event.organizationId, organizationId), notDeleted(event)),
      )
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
      .where(
        and(
          eq(eventMember.eventId, eventId),
          eq(event.organizationId, organizationId),
          notDeleted(eventMember),
        ),
      )
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

  /** The user's current (not removed) assignment to the event. */
  async findActiveMember(
    tx: DbExecutor,
    eventId: string,
    userId: string,
  ): Promise<EventMemberRow | undefined> {
    const [row] = await tx
      .select()
      .from(eventMember)
      .where(
        and(
          eq(eventMember.eventId, eventId),
          eq(eventMember.userId, userId),
          notDeleted(eventMember),
        ),
      )
      .limit(1);
    return row;
  }

  async insertMember(
    tx: DbExecutor,
    eventId: string,
    userId: string,
    role: EventMemberRole,
  ): Promise<EventMemberRow> {
    const [created] = await tx.insert(eventMember).values({ eventId, userId, role }).returning();
    return created!;
  }

  async updateMemberRole(
    tx: DbExecutor,
    id: string,
    role: EventMemberRole,
  ): Promise<EventMemberRow> {
    const [updated] = await tx
      .update(eventMember)
      .set({ role })
      .where(eq(eventMember.id, id))
      .returning();
    return updated!;
  }

  /** Soft-deletes the user's current assignment. Returns it, or undefined if there was none. */
  async removeMember(
    tx: DbExecutor,
    eventId: string,
    userId: string,
  ): Promise<EventMemberRow | undefined> {
    const [removed] = await tx
      .update(eventMember)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(eventMember.eventId, eventId),
          eq(eventMember.userId, userId),
          notDeleted(eventMember),
        ),
      )
      .returning();
    return removed;
  }
}
