import { z } from 'zod';
import { dateTimeOutput } from '../common/schemas.js';
import { createTaskSchema } from '../features/tasks/tasks.schemas.js';
import {
  citationSchema,
  questionAnswerSchema,
  questionPayloadSchema,
  taskSuggestionPayloadSchema,
  updateEventPayloadSchema,
} from './ai.types.js';

/** API contracts for the AI agent: runs, suggestions, memory and usage. */

const suggestionBase = {
  id: z.uuid(),
  eventId: z.uuid(),
  status: z.enum(['pending', 'accepted', 'rejected', 'dismissed_stale']),
  title: z.string(),
  explanation: z.string(),
  citations: z.array(citationSchema.meta({ id: 'AiCitation' })),
  createdAt: dateTimeOutput,
  seenAt: dateTimeOutput.nullable(),
};

export const aiSuggestionSchema = z
  .discriminatedUnion('kind', [
    z.object({
      ...suggestionBase,
      kind: z.literal('task_suggestion'),
      payload: taskSuggestionPayloadSchema.meta({ id: 'AiTaskSuggestionPayload' }),
      answer: z.null(),
    }),
    z.object({
      ...suggestionBase,
      kind: z.literal('question'),
      payload: questionPayloadSchema.meta({ id: 'AiQuestionPayload' }),
      answer: questionAnswerSchema.nullable(),
    }),
    z.object({
      ...suggestionBase,
      kind: z.literal('update_event'),
      payload: updateEventPayloadSchema.meta({ id: 'AiUpdateEventPayload' }),
      answer: z.null(),
    }),
  ])
  .meta({ id: 'AiSuggestion' });
export type AiSuggestionDto = z.infer<typeof aiSuggestionSchema>;

export const aiRunSchema = z
  .object({
    id: z.uuid(),
    feature: z.enum(['task_suggestions', 'task_drafting']),
    trigger: z.enum(['on_demand', 'event_created', 'question_answered']),
    status: z.enum(['queued', 'running', 'succeeded', 'failed']),
    createdAt: dateTimeOutput,
    finishedAt: dateTimeOutput.nullable(),
  })
  .meta({ id: 'AiRun' });
export type AiRunDto = z.infer<typeof aiRunSchema>;

/** The agent's state for one event: whether AI is available, what runs, and what it suggests. */
export const aiEventStateSchema = z
  .object({
    /** False when no model is configured: the panel says AI is unavailable. */
    enabled: z.boolean(),
    /** The latest run per feature. */
    runs: z.array(aiRunSchema),
    /** Pending suggestions, plus answered or decided ones of the last runs for context. */
    suggestions: z.array(aiSuggestionSchema),
  })
  .meta({ id: 'AiEventState' });
export type AiEventStateDto = z.infer<typeof aiEventStateSchema>;

/** Accepting a task suggestion: the task as the organizer edited it in the dialog. */
export const acceptTaskSuggestionsSchema = z
  .object({
    items: z
      .array(z.object({ suggestionId: z.uuid(), task: createTaskSchema }))
      .min(1)
      .max(20),
  })
  .meta({ id: 'AcceptTaskSuggestions' });
export type AcceptTaskSuggestionsInput = z.infer<typeof acceptTaskSuggestionsSchema>;

/** Accepting a proposed event change, optionally with the value edited. */
export const acceptEventUpdateSchema = z
  .object({ value: z.string().trim().min(1).max(2000).optional() })
  .meta({ id: 'AcceptEventUpdate' });
export type AcceptEventUpdateInput = z.infer<typeof acceptEventUpdateSchema>;

export const answerQuestionSchema = z
  .object({ text: z.string().trim().min(1).max(1000) })
  .meta({ id: 'AnswerQuestion' });
export type AnswerQuestionInput = z.infer<typeof answerQuestionSchema>;

export const markSeenSchema = z
  .object({ suggestionIds: z.array(z.uuid()).min(1).max(100) })
  .meta({ id: 'MarkAiSuggestionsSeen' });
export type MarkSeenInput = z.infer<typeof markSeenSchema>;

export const aiMemorySchema = z
  .object({
    id: z.uuid(),
    /** The event the fact is about; null for organization-wide facts. */
    event: z.object({ id: z.uuid(), name: z.string() }).nullable(),
    content: z.string(),
    source: z.enum(['organizer_answer', 'inference']),
    confidence: z.enum(['low', 'medium', 'high']),
    citations: z.array(citationSchema),
    copiedFromPreviousEdition: z.boolean(),
    createdAt: dateTimeOutput,
  })
  .meta({ id: 'AiMemory' });
export type AiMemoryDto = z.infer<typeof aiMemorySchema>;

export const aiUsageSchema = z
  .object({ monthToDateCents: z.number().int(), capCents: z.number().int() })
  .meta({ id: 'AiUsage' });

/** "Help me taken maken": the organizer's own list, in any form. */
export const draftTasksSchema = z
  .object({ text: z.string().trim().min(1).max(4000) })
  .meta({ id: 'DraftTasks' });
export type DraftTasksInput = z.infer<typeof draftTasksSchema>;

/** The tasks Mila understood, for the organizer to check before anything is created. */
export const taskDraftSchema = z
  .object({
    /** The drafting run: creating the tasks refers to it, and the log keeps it as their source. */
    runId: z.uuid(),
    tasks: z.array(
      z
        .object({
          title: z.string(),
          description: z.string().nullable(),
          priority: z.enum(['low', 'medium', 'high']),
          dueDate: z.iso.date().nullable(),
          assigneeUserId: z.string().nullable(),
          assigneeName: z.string().nullable(),
          /** The existing task with the same title: shown as a warning, unticked by default. */
          duplicateOf: z.string().nullable(),
        })
        .meta({ id: 'DraftTask' }),
    ),
  })
  .meta({ id: 'TaskDraft' });
export type TaskDraftDto = z.infer<typeof taskDraftSchema>;

export const createDraftTasksSchema = z
  .object({ tasks: z.array(createTaskSchema).min(1).max(30) })
  .meta({ id: 'CreateDraftTasks' });
export type CreateDraftTasksInput = z.infer<typeof createDraftTasksSchema>;
