import { z } from 'zod';
import { AI_EVENT_FIELDS } from '../ai.types.js';

/**
 * What the model returns for a task-suggestion run. Every field is required (nullable where
 * optional), which strict structured-output modes need. `cites` are the short references from
 * the prompt (E, P1, T3, M2); the server maps them back to real records.
 */
export const taskSuggestionOutputSchema = z.object({
  tasks: z.array(
    z.object({
      title: z.string().describe('Short task title, in the output language'),
      description: z.string().nullable(),
      priority: z.enum(['low', 'medium', 'high']),
      daysBeforeEvent: z
        .number()
        .int()
        .nullable()
        .describe('When the task should be done, in days before the event starts'),
      reason: z.string().describe('Why this task, in one or two sentences'),
      cites: z.array(z.string()).describe('References of the records this is based on'),
    }),
  ),
  questions: z.array(
    z.object({
      question: z.string(),
      options: z.array(z.string()).describe('Answers to pick from; empty for free text'),
      eventField: z
        .enum(AI_EVENT_FIELDS)
        .nullable()
        .describe('The event field the answer fills in, or null'),
      reason: z.string(),
    }),
  ),
  eventUpdates: z.array(
    z.object({
      field: z.enum(AI_EVENT_FIELDS),
      value: z.string(),
      reason: z.string(),
      cites: z.array(z.string()),
    }),
  ),
  memories: z.array(
    z.object({
      content: z.string().describe('One fact that has no field on the event'),
      scope: z.enum(['event', 'organization']),
      confidence: z.enum(['low', 'medium', 'high']),
      cites: z.array(z.string()),
    }),
  ),
});

export type TaskSuggestionOutput = z.infer<typeof taskSuggestionOutputSchema>;
