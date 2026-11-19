import { Injectable, Logger } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, asc, eq } from 'drizzle-orm';
import type { Database } from '../../db/database.js';
import { event, task, type AiRunRow, type EventRow } from '../../db/schema/index.js';
import { notDeleted } from '../../db/soft-delete.js';
import { LiveUpdatesService } from '../../jobs/live-updates.service.js';
import { AiClient } from '../ai-client.service.js';
import { AI_EVENT_FIELDS, questionAnswerSchema } from '../ai.types.js';
import { todayInBrussels as brusselsDate } from '../../features/profile/profile-rules.js';
import { AiSuggestionsRepository } from '../suggestions/ai-suggestions.repository.js';
import { buildTaskSuggestionContext } from './task-suggestions.context.js';
import {
  planTaskSuggestions,
  staleSuggestionKeys,
  type PlanState,
} from './task-suggestions.plan.js';
import {
  TASK_SUGGESTIONS_PROMPT_VERSION,
  TASK_SUGGESTIONS_SYSTEM,
} from './task-suggestions.prompt.js';
import { taskSuggestionOutputSchema } from './task-suggestions.schema.js';

/** The organizations are Flemish; a per-organization setting comes later. */
const OUTPUT_LANGUAGE = 'nl-BE';

/**
 * Carries out one task-suggestion run: gathers the event's context, asks the model, applies the
 * planner's rules and saves the result in one transaction.
 */
@Injectable()
export class TaskSuggestionsRunner {
  private readonly logger = new Logger(TaskSuggestionsRunner.name);

  constructor(
    @InjectDrizzle() private readonly db: Database,
    private readonly ai: AiClient,
    private readonly suggestions: AiSuggestionsRepository,
    private readonly live: LiveUpdatesService,
  ) {}

  /** Returns the model and prompt version that produced the result. */
  async run(run: AiRunRow): Promise<{ model: string; promptVersion: string }> {
    const current = await this.findEvent(run.organizationId, run.eventId);
    if (!current) throw new EventGoneError();
    const previous = current.previousEditionId
      ? await this.findEvent(run.organizationId, current.previousEditionId)
      : undefined;

    // Once, on the event's first run: later runs must not bring back memories an admin deleted.
    if (previous && run.trigger === 'event_created') {
      await this.suggestions.copyEditionMemories(
        this.db,
        run.organizationId,
        previous.id,
        current.id,
      );
    }

    const [currentTasks, previousTasks, memories, earlier] = await Promise.all([
      this.listTasks(current.id),
      previous ? this.listTasks(previous.id) : Promise.resolve([]),
      this.suggestions.listMemoriesFor(run.organizationId, current.id),
      this.suggestions.listForEvent(current.id, ['task_suggestion', 'question', 'update_event']),
    ]);

    const today = brusselsDate(new Date());
    const { prompt, refs } = buildTaskSuggestionContext({
      language: OUTPUT_LANGUAGE,
      today,
      event: {
        id: current.id,
        name: current.name,
        eventType: current.eventType,
        description: current.description,
        location: current.location,
        startDate: brusselsDate(current.startsAt),
        endDate: brusselsDate(current.endsAt),
        expectedAttendance: current.expectedAttendance,
      },
      previousEdition: previous
        ? {
            id: previous.id,
            name: previous.name,
            startDate: brusselsDate(previous.startsAt),
            actualAttendance: previous.actualAttendance,
            retrospective: previous.retrospective,
            tasks: previousTasks,
          }
        : null,
      currentTasks,
      memories: memories.map((memory) => ({
        id: memory.id,
        content: memory.content,
        scope: memory.eventId ? 'event' : 'organization',
        copiedFromPreviousEdition: memory.copiedFromId !== null,
      })),
      answeredQuestions: earlier
        .filter((row) => row.kind === 'question' && row.answer)
        .map((row) => ({
          question: row.title,
          answer: questionAnswerSchema.parse(row.answer).text,
        })),
      earlierSuggestions: earlier
        .filter((row) => row.kind === 'task_suggestion')
        .map((row) => ({ title: row.title, status: row.status })),
    });

    const result = await this.ai.generate({
      run,
      feature: 'task_suggestions',
      promptVersion: TASK_SUGGESTIONS_PROMPT_VERSION,
      schema: taskSuggestionOutputSchema,
      system: TASK_SUGGESTIONS_SYSTEM,
      prompt,
    });

    // Plan against the event as it is now: the organizer may have changed it during the call.
    const fresh = (await this.findEvent(run.organizationId, current.id)) ?? current;
    const state: PlanState = {
      eventStartDate: brusselsDate(fresh.startsAt),
      today,
      existingTaskTitles: (await this.listTasks(fresh.id)).map((row) => row.title),
      emptyEventFields: AI_EVENT_FIELDS.filter(
        (field) => fresh[field] === null || fresh[field] === '',
      ),
      openQuestionCount: (await this.suggestions.listPending(fresh.id)).filter(
        (row) => row.kind === 'question',
      ).length,
      existingMemoryContents: memories.map((memory) => memory.content),
    };
    const plan = planTaskSuggestions(result.output, refs, state);
    if (plan.dropped.length > 0) {
      this.logger.log(`Run ${run.id} dropped ${JSON.stringify(plan.dropped)}`);
    }

    await this.db.transaction(async (tx) => {
      const pending = await this.suggestions.listPending(fresh.id);
      await this.suggestions.dismissStale(
        tx,
        fresh.id,
        staleSuggestionKeys(
          pending.map((row) => row.dedupKey),
          state,
        ),
      );
      await this.suggestions.upsert(
        tx,
        plan.suggestions.map((suggestion) => ({
          ...suggestion,
          organizationId: run.organizationId,
          eventId: fresh.id,
          runId: run.id,
        })),
      );
      await this.suggestions.insertMemories(
        tx,
        plan.memories.map((memory) => ({
          organizationId: run.organizationId,
          eventId: memory.scope === 'event' ? fresh.id : null,
          content: memory.content,
          source: 'inference',
          confidence: memory.confidence,
          citations: memory.citations,
          runId: run.id,
        })),
      );
      await this.live.publish(tx, { type: 'ai_suggestions', eventId: fresh.id });
    });

    return { model: result.model, promptVersion: TASK_SUGGESTIONS_PROMPT_VERSION };
  }

  private async findEvent(organizationId: string, eventId: string): Promise<EventRow | undefined> {
    const [row] = await this.db
      .select()
      .from(event)
      .where(
        and(eq(event.id, eventId), eq(event.organizationId, organizationId), notDeleted(event)),
      )
      .limit(1);
    return row;
  }

  private listTasks(eventId: string) {
    return this.db
      .select({
        id: task.id,
        title: task.title,
        description: task.description,
        priority: task.priority,
        status: task.status,
        dueDate: task.dueDate,
      })
      .from(task)
      .where(and(eq(task.eventId, eventId), notDeleted(task)))
      .orderBy(asc(task.createdAt));
  }
}

/** The run's event was deleted meanwhile: nothing to retry. */
export class EventGoneError extends Error {
  constructor() {
    super('The event no longer exists');
    this.name = 'EventGoneError';
  }
}
