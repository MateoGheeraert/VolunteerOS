import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { Database, DbExecutor } from '../../db/database.js';
import {
  aiMemory,
  aiSuggestion,
  event,
  type AiSuggestionKind,
  type AiSuggestionRow,
  type AiSuggestionStatus,
  type NewAiMemoryRow,
  type NewAiSuggestionRow,
} from '../../db/schema/index.js';

/**
 * Data access for AI suggestions and memory. Every query is scoped to an event or organization
 * the caller has already been authorized for.
 */
@Injectable()
export class AiSuggestionsRepository {
  constructor(@InjectDrizzle() private readonly db: Database) {}

  listPending(eventId: string): Promise<AiSuggestionRow[]> {
    return this.db
      .select()
      .from(aiSuggestion)
      .where(and(eq(aiSuggestion.eventId, eventId), eq(aiSuggestion.status, 'pending')))
      .orderBy(asc(aiSuggestion.createdAt), asc(aiSuggestion.title));
  }

  /** Every suggestion of the event of the given kinds, newest first (for the next prompt). */
  listForEvent(
    eventId: string,
    kinds: AiSuggestionKind[],
    limit = 100,
  ): Promise<AiSuggestionRow[]> {
    return this.db
      .select()
      .from(aiSuggestion)
      .where(and(eq(aiSuggestion.eventId, eventId), inArray(aiSuggestion.kind, kinds)))
      .orderBy(desc(aiSuggestion.createdAt))
      .limit(limit);
  }

  async find(eventId: string, suggestionId: string): Promise<AiSuggestionRow | undefined> {
    const [row] = await this.db
      .select()
      .from(aiSuggestion)
      .where(and(eq(aiSuggestion.eventId, eventId), eq(aiSuggestion.id, suggestionId)))
      .limit(1);
    return row;
  }

  /**
   * Decides a pending suggestion. Conditional on it still being pending, so two organizers
   * deciding at once can't both act on it: the second gets undefined.
   */
  async decide(
    tx: DbExecutor,
    eventId: string,
    suggestionId: string,
    kind: AiSuggestionKind,
    status: Exclude<AiSuggestionStatus, 'pending'>,
    userId: string,
    extra: Partial<Pick<AiSuggestionRow, 'answer'>> = {},
  ): Promise<AiSuggestionRow | undefined> {
    const [row] = await tx
      .update(aiSuggestion)
      .set({ status, resolvedAt: new Date(), resolvedByUserId: userId, ...extra })
      .where(
        and(
          eq(aiSuggestion.id, suggestionId),
          eq(aiSuggestion.eventId, eventId),
          eq(aiSuggestion.kind, kind),
          eq(aiSuggestion.status, 'pending'),
        ),
      )
      .returning();
    return row;
  }

  async markSeen(eventId: string, suggestionIds: string[]): Promise<void> {
    await this.db
      .update(aiSuggestion)
      .set({ seenAt: new Date() })
      .where(
        and(
          eq(aiSuggestion.eventId, eventId),
          inArray(aiSuggestion.id, suggestionIds),
          isNull(aiSuggestion.seenAt),
        ),
      );
  }

  /** Closes pending suggestions whose cause went away. */
  async dismissStale(tx: DbExecutor, eventId: string, dedupKeys: string[]): Promise<number> {
    if (dedupKeys.length === 0) return 0;
    const rows = await tx
      .update(aiSuggestion)
      .set({ status: 'dismissed_stale', resolvedAt: new Date() })
      .where(
        and(
          eq(aiSuggestion.eventId, eventId),
          eq(aiSuggestion.status, 'pending'),
          inArray(aiSuggestion.dedupKey, dedupKeys),
        ),
      )
      .returning({ id: aiSuggestion.id });
    return rows.length;
  }

  /**
   * Saves new suggestions. One row per event and dedup key, ever: a key that was accepted,
   * rejected or is still pending is skipped; one closed as stale opens again with the new text.
   */
  async upsert(tx: DbExecutor, rows: NewAiSuggestionRow[]): Promise<number> {
    if (rows.length === 0) return 0;
    const saved = await tx
      .insert(aiSuggestion)
      .values(rows)
      .onConflictDoUpdate({
        target: [aiSuggestion.eventId, aiSuggestion.dedupKey],
        set: {
          runId: sql`excluded.run_id`,
          title: sql`excluded.title`,
          explanation: sql`excluded.explanation`,
          payload: sql`excluded.payload`,
          citations: sql`excluded.citations`,
          status: 'pending',
          seenAt: null,
          resolvedAt: null,
          resolvedByUserId: null,
          createdAt: sql`now()`,
        },
        setWhere: eq(aiSuggestion.status, 'dismissed_stale'),
      })
      .returning({ id: aiSuggestion.id });
    return saved.length;
  }

  /** The memories a run may use: the organization's and the event's, not superseded. */
  listMemoriesFor(organizationId: string, eventId: string) {
    return this.db
      .select()
      .from(aiMemory)
      .where(
        and(
          eq(aiMemory.organizationId, organizationId),
          sql`(${aiMemory.eventId} is null or ${aiMemory.eventId} = ${eventId})`,
          isNull(aiMemory.supersededById),
        ),
      )
      .orderBy(asc(aiMemory.createdAt));
  }

  /** All of the organization's memories, with their event's name, newest first. */
  listMemoriesOfOrganization(organizationId: string) {
    return this.db
      .select({ memory: aiMemory, eventName: event.name })
      .from(aiMemory)
      .leftJoin(event, eq(event.id, aiMemory.eventId))
      .where(and(eq(aiMemory.organizationId, organizationId), isNull(aiMemory.supersededById)))
      .orderBy(desc(aiMemory.createdAt));
  }

  async insertMemories(tx: DbExecutor, rows: NewAiMemoryRow[]): Promise<void> {
    if (rows.length > 0) await tx.insert(aiMemory).values(rows);
  }

  /** Copies the previous edition's event memories to the new edition, once. */
  async copyEditionMemories(
    tx: DbExecutor,
    organizationId: string,
    fromEventId: string,
    toEventId: string,
  ): Promise<void> {
    const [copied] = await tx
      .select({ id: aiMemory.id })
      .from(aiMemory)
      .where(and(eq(aiMemory.eventId, toEventId), sql`${aiMemory.copiedFromId} is not null`))
      .limit(1);
    if (copied) return;
    const previous = await tx
      .select()
      .from(aiMemory)
      .where(
        and(
          eq(aiMemory.organizationId, organizationId),
          eq(aiMemory.eventId, fromEventId),
          isNull(aiMemory.supersededById),
        ),
      );
    await this.insertMemories(
      tx,
      previous.map((memory) => ({
        organizationId,
        eventId: toEventId,
        content: memory.content,
        source: memory.source,
        confidence: memory.confidence,
        citations: memory.citations,
        copiedFromId: memory.id,
      })),
    );
  }

  async deleteMemory(tx: DbExecutor, organizationId: string, memoryId: string) {
    const [row] = await tx
      .delete(aiMemory)
      .where(and(eq(aiMemory.id, memoryId), eq(aiMemory.organizationId, organizationId)))
      .returning();
    return row;
  }
}
