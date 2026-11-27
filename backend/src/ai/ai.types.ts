import { z } from 'zod';
import { MAX_BUDGET_CENTS } from '../db/schema/budget.js';

/**
 * Shapes stored in the AI tables' JSON columns. The schema files import the types; the services
 * validate with the Zod schemas on every write and read.
 */

/**
 * A stored record an AI output is based on. `label` is what the UI shows ("Taak: Tent huren").
 * `catalog`: an action from the promotion catalogue; its id is the catalogue key.
 */
export const citationSchema = z.object({
  // `catalog`: a promotion action; `team`, `shift`: the previous edition's or this event's;
  // `catalogue`: a staffing rule of thumb; `note`: a volunteer's note on their application;
  // `request`: what the organizer asked Mila for.
  type: z.enum([
    'event',
    'task',
    'memory',
    'catalog',
    'team',
    'shift',
    'catalogue',
    'note',
    'request',
  ]),
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

/** Kinds of promotion action, shared by the catalogue and Mila's output (docs/info.md §7.11). */
export const PROMO_ACTION_TYPES = [
  'offline',
  'social',
  'partnership',
  'giveaway',
  'listing',
  'press',
  'word_of_mouth',
] as const;
export type PromoActionType = (typeof PROMO_ACTION_TYPES)[number];
export const PROMO_EFFORTS = ['low', 'medium', 'high'] as const;
export type PromoEffort = (typeof PROMO_EFFORTS)[number];

/** One action of a promotion plan, as the planner checked it. */
export const promoActionPayloadSchema = z.object({
  /** The catalogue action it adapts; null when it repeats a past-edition task instead. */
  catalogKey: z.string().max(100).nullable(),
  title: z.string().min(1).max(200),
  type: z.enum(PROMO_ACTION_TYPES),
  /** Who it reaches, in words ("studenten van de hogeschool"). */
  audience: z.string().max(200),
  /** When to do it, in whole weeks before the event starts (after moving a past date to today). */
  weeksBefore: z.number().int().min(0).max(52),
  dueDate: z.iso.date(),
  estimatedCostCents: z.number().int().min(0).max(MAX_BUDGET_CENTS),
  effort: z.enum(PROMO_EFFORTS),
  /** How to do it, step by step: becomes the task's description. */
  howTo: z.string().max(2000),
});
export type PromoActionPayload = z.infer<typeof promoActionPayloadSchema>;

/** The answer an organizer gave to a question card. */
export const questionAnswerSchema = z.object({ text: z.string().min(1).max(1000) });
export type QuestionAnswer = z.infer<typeof questionAnswerSchema>;
