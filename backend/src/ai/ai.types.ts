import { z } from 'zod';

/**
 * Shapes stored in the AI tables' JSON columns. The schema files import the types; the services
 * validate with the Zod schemas on every write and read.
 */

/** A stored record an AI output is based on. `label` is what the UI shows ("Taak: Tent huren"). */
export const citationSchema = z.object({
  type: z.enum(['event', 'task', 'memory']),
  id: z.string(),
  label: z.string(),
});
export type Citation = z.infer<typeof citationSchema>;

/** Event fields the agent may propose a value for (and map a question's answer to). */
export const AI_EVENT_FIELDS = ['description', 'location', 'expectedAttendance'] as const;
export type AiEventField = (typeof AI_EVENT_FIELDS)[number];

export const taskSuggestionPayloadSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).nullable(),
  priority: z.enum(['low', 'medium', 'high']),
  /** Suggested due date, already counted back from the event's start. */
  dueDate: z.iso.date().nullable(),
});
export type TaskSuggestionPayload = z.infer<typeof taskSuggestionPayloadSchema>;

export const questionPayloadSchema = z.object({
  /** Answer options to pick from; empty means free text only. */
  options: z.array(z.string().min(1).max(100)).max(6),
  /** The event field the answer fills in, or null when it goes to memory. */
  // A union rather than .nullable(): the OpenAPI export drops null from a nullable enum.
  eventField: z.union([z.enum(AI_EVENT_FIELDS), z.null()]),
});
export type QuestionPayload = z.infer<typeof questionPayloadSchema>;

export const updateEventPayloadSchema = z.object({
  field: z.enum(AI_EVENT_FIELDS),
  /** Always text; numbers are parsed when the suggestion is accepted. */
  value: z.string().min(1).max(2000),
});
export type UpdateEventPayload = z.infer<typeof updateEventPayloadSchema>;

/** The answer an organizer gave to a question card. */
export const questionAnswerSchema = z.object({ text: z.string().min(1).max(1000) });
export type QuestionAnswer = z.infer<typeof questionAnswerSchema>;
