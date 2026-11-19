import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { recordActivity } from '../../activity/activity-log.js';
import type { OrgContext } from '../../authz/org-context.js';
import type { Database } from '../../db/database.js';
import type { AiMemoryDto } from '../ai.schemas.js';
import { AiSuggestionsRepository } from './ai-suggestions.repository.js';

/**
 * What the agent remembers, for owners and admins: hidden from the normal screens, but they can
 * see every fact and delete wrong ones, which would otherwise skew every later suggestion.
 */
@Injectable()
export class AiMemoryService {
  constructor(
    @InjectDrizzle() private readonly db: Database,
    private readonly suggestions: AiSuggestionsRepository,
  ) {}

  async list(org: OrgContext): Promise<AiMemoryDto[]> {
    const rows = await this.suggestions.listMemoriesOfOrganization(org.organizationId);
    return rows.map(({ memory, eventName }) => ({
      id: memory.id,
      event: memory.eventId ? { id: memory.eventId, name: eventName ?? '' } : null,
      content: memory.content,
      source: memory.source,
      confidence: memory.confidence,
      citations: memory.citations,
      copiedFromPreviousEdition: memory.copiedFromId !== null,
      createdAt: memory.createdAt.toISOString(),
    }));
  }

  /** Deletes the fact for good (no soft delete: a wrong fact must not linger). */
  async remove(org: OrgContext, memoryId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const row = await this.suggestions.deleteMemory(tx, org.organizationId, memoryId);
      if (!row) throw new NotFoundException('Memory not found');
      await recordActivity(tx, org, {
        action: 'deleted',
        entityType: 'ai_memory',
        entity: row,
        eventId: row.eventId,
      });
    });
  }
}
