import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { recordActivity, withSource } from '../../activity/activity-log.js';
import type { EventAccess } from '../../authz/event-access.service.js';
import type { OrgContext } from '../../authz/org-context.js';
import type { Database, Transaction } from '../../db/database.js';
import type { AiSuggestionKind, AiSuggestionRow } from '../../db/schema/index.js';
import { EventsService } from '../../features/events/events.service.js';
import { TasksService } from '../../features/tasks/tasks.service.js';
import { LiveUpdatesService } from '../../jobs/live-updates.service.js';
import { AiClient } from '../ai-client.service.js';
import type {
  AcceptEventUpdateInput,
  AcceptTaskSuggestionsInput,
  AiEventStateDto,
  AiRunDto,
  AiSuggestionDto,
  AnswerQuestionInput,
} from '../ai.schemas.js';
import { aiSuggestionSchema } from '../ai.schemas.js';
import { questionPayloadSchema, updateEventPayloadSchema } from '../ai.types.js';
import { eventFieldPatch, normalizeEventFieldValue } from '../event-fields.js';
import { AiRunsService } from '../runs/ai-runs.service.js';
import { AiSuggestionsRepository } from './ai-suggestions.repository.js';

/** Suggestion fields the activity log keeps the values of: none are personal. */
const SUGGESTION_LOGGED_VALUES = ['kind', 'status'] as const;

/**
 * What organizers do with the agent's suggestions. The agent never changes domain data itself:
 * accepting runs the normal service (tasks, events) as the organizer, with the suggestion recorded
 * as the change's source in the activity log, in the same transaction that marks it accepted.
 *
 * Routes have already authorized the event for 'manage'.
 */
@Injectable()
export class AiSuggestionsService {
  constructor(
    @InjectDrizzle() private readonly db: Database,
    private readonly suggestions: AiSuggestionsRepository,
    private readonly runs: AiRunsService,
    private readonly ai: AiClient,
    private readonly tasks: TasksService,
    private readonly events: EventsService,
    private readonly live: LiveUpdatesService,
  ) {}

  async state(access: EventAccess): Promise<AiEventStateDto> {
    const [runs, pending] = await Promise.all([
      this.runs.latestForEvent(access.event.id),
      this.suggestions.listPending(access.event.id),
    ]);
    return {
      enabled: this.ai.enabled,
      runs: runs.map((run): AiRunDto => ({
        id: run.id,
        feature: run.feature,
        trigger: run.trigger,
        status: run.status,
        createdAt: run.createdAt.toISOString(),
        finishedAt: run.finishedAt?.toISOString() ?? null,
      })),
      suggestions: pending.map(toSuggestionDto),
    };
  }

  /** The organizer asks for (new) task suggestions now. */
  async requestTaskSuggestions(org: OrgContext, access: EventAccess): Promise<AiRunDto> {
    const run = await this.runs.enqueue({
      organizationId: org.organizationId,
      eventId: access.event.id,
      feature: 'task_suggestions',
      trigger: 'on_demand',
      requestedByUserId: org.userId,
    });
    if (!run) throw new ConflictException('AI is not available');
    return {
      id: run.id,
      feature: run.feature,
      trigger: run.trigger,
      status: run.status,
      createdAt: run.createdAt.toISOString(),
      finishedAt: run.finishedAt?.toISOString() ?? null,
    };
  }

  /** Creates the tasks as edited in the dialog, and marks their suggestions accepted. */
  async acceptTasks(
    org: OrgContext,
    access: EventAccess,
    input: AcceptTaskSuggestionsInput,
  ): Promise<void> {
    const eventId = access.event.id;
    await this.db.transaction(async (tx) => {
      for (const item of input.items) {
        const row = await this.decide(
          tx,
          org,
          access,
          item.suggestionId,
          'task_suggestion',
          'accepted',
        );
        await this.tasks.createInTransaction(
          tx,
          withSource(org, { type: 'ai_suggestion', id: row.id }),
          access,
          item.task,
        );
      }
      await this.live.publish(tx, { type: 'ai_suggestions', eventId });
    });
  }

  /** Fills in the proposed event field (as edited), and marks the suggestion accepted. */
  async acceptEventUpdate(
    org: OrgContext,
    access: EventAccess,
    suggestionId: string,
    input: AcceptEventUpdateInput,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const row = await this.decide(tx, org, access, suggestionId, 'update_event', 'accepted');
      const payload = updateEventPayloadSchema.parse(row.payload);
      const value = normalizeEventFieldValue(payload.field, input.value ?? payload.value);
      if (value === null) throw new BadRequestException(`value: not a valid ${payload.field}`);
      await this.events.update(
        withSource(org, { type: 'ai_suggestion', id: row.id }),
        access.event,
        eventFieldPatch(payload.field, value),
        tx,
      );
      await this.live.publish(tx, { type: 'ai_suggestions', eventId: access.event.id });
    });
  }

  /**
   * Answers a question card. An answer that fits the event field the question is about fills it
   * in; any other answer becomes a memory. Either way the agent runs again with the new knowledge.
   */
  async answer(
    org: OrgContext,
    access: EventAccess,
    suggestionId: string,
    input: AnswerQuestionInput,
  ): Promise<void> {
    const eventId = access.event.id;
    await this.db.transaction(async (tx) => {
      const row = await this.decide(tx, org, access, suggestionId, 'question', 'accepted', {
        answer: { text: input.text },
      });
      const { eventField } = questionPayloadSchema.parse(row.payload);
      const value = eventField && normalizeEventFieldValue(eventField, input.text);
      const fieldEmpty =
        eventField !== null &&
        (access.event[eventField] === null || access.event[eventField] === '');
      if (eventField && value && fieldEmpty) {
        await this.events.update(
          withSource(org, { type: 'ai_suggestion', id: row.id }),
          access.event,
          eventFieldPatch(eventField, value),
          tx,
        );
      } else {
        await this.suggestions.insertMemories(tx, [
          {
            organizationId: org.organizationId,
            eventId,
            content: `${row.title} ${input.text}`,
            source: 'organizer_answer',
            confidence: 'high',
            citations: [],
            runId: row.runId,
            suggestionId: row.id,
          },
        ]);
      }
      await this.runs.enqueue(
        {
          organizationId: org.organizationId,
          eventId,
          feature: 'task_suggestions',
          trigger: 'question_answered',
          requestedByUserId: org.userId,
        },
        tx,
      );
      await this.live.publish(tx, { type: 'ai_suggestions', eventId });
    });
  }

  /** Rejects a suggestion, or dismisses a question: it won't be made again for this event. */
  async reject(org: OrgContext, access: EventAccess, suggestionId: string): Promise<void> {
    const current = await this.suggestions.find(access.event.id, suggestionId);
    if (!current) throw new NotFoundException('Suggestion not found');
    await this.db.transaction(async (tx) => {
      await this.decide(tx, org, access, suggestionId, current.kind, 'rejected');
      await this.live.publish(tx, { type: 'ai_suggestions', eventId: access.event.id });
    });
  }

  async markSeen(access: EventAccess, suggestionIds: string[]): Promise<void> {
    await this.suggestions.markSeen(access.event.id, suggestionIds);
  }

  /** Marks the pending suggestion decided and logs it; 404 or 409 when it can't be. */
  private async decide(
    tx: Transaction,
    org: OrgContext,
    access: EventAccess,
    suggestionId: string,
    kind: AiSuggestionKind,
    status: 'accepted' | 'rejected',
    extra: Partial<Pick<AiSuggestionRow, 'answer'>> = {},
  ): Promise<AiSuggestionRow> {
    const eventId = access.event.id;
    const current = await this.suggestions.find(eventId, suggestionId);
    if (!current || current.kind !== kind) throw new NotFoundException('Suggestion not found');
    const row = await this.suggestions.decide(
      tx,
      eventId,
      suggestionId,
      kind,
      status,
      org.userId,
      extra,
    );
    if (!row) throw new ConflictException('The suggestion was already handled');
    await recordActivity(tx, org, {
      action: status,
      entityType: 'ai_suggestion',
      entity: row,
      before: current,
      eventId,
      values: SUGGESTION_LOGGED_VALUES,
    });
    return row;
  }
}

/** Validates the stored payload against its kind's schema on the way out. */
export function toSuggestionDto(row: AiSuggestionRow): AiSuggestionDto {
  return aiSuggestionSchema.parse({
    id: row.id,
    eventId: row.eventId,
    kind: row.kind,
    status: row.status,
    title: row.title,
    explanation: row.explanation,
    payload: row.payload,
    citations: row.citations,
    answer: row.answer ?? null,
    createdAt: row.createdAt.toISOString(),
    seenAt: row.seenAt?.toISOString() ?? null,
  });
}
