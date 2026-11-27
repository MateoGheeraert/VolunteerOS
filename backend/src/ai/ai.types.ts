import { z } from 'zod';
import { MAX_BUDGET_CENTS } from '../db/schema/budget.js';

/**
 * Shapes stored in the AI tables' JSON columns. The schema files import the types; the services
 * validate with the Zod schemas on every write and read.
 */

/**
 * A stored record an AI output is based on. `label` is what the UI shows ("Taak: Tent huren").
 * `catalog`: an action from the promotion catalogue; its id is the catalogue key.
 * `checklist`: an item of Mila's checklist of typical event costs (its `id` is the item's key).
 */
export const citationSchema = z.object({
  // `catalog`: a promotion action; `team`, `shift`: the previous edition's or this event's;
  // `catalogue`: a staffing rule of thumb; `note`: a volunteer's note on their application;
  // `request`: what the organizer asked Mila for; `budget_entry`: a budget line;
  // `checklist`: an item of the typical event costs.
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
    'budget_entry',
    'checklist',
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

const cents = () => z.number().int().min(0);

/**
 * Where the estimate of a proposed budget line comes from. Always computed by the server, never by
 * the model: the previous edition's actual amount (scaled by the visitors when the line grows with
 * them), or the middle of a richtprijs range from Mila's checklist.
 */
export const budgetLineEstimateSchema = z.discriminatedUnion('basis', [
  z.object({
    basis: z.literal('previous_edition'),
    cents: cents(),
    /** The previous edition's line, as it was settled. */
    source: z.object({
      eventName: z.string(),
      title: z.string(),
      actualCents: cents(),
      /** The previous edition's actual visitors; null when unknown. */
      attendance: z.number().int().nullable(),
    }),
    /** This event's expected visitors, when the amount was scaled to them. */
    targetAttendance: z.number().int().nullable(),
    /** True when the line grows with the visitors and both visitor numbers are known. */
    scaled: z.boolean(),
  }),
  z.object({
    basis: z.literal('richtprijs'),
    cents: cents(),
    checklistKey: z.string(),
    minCents: cents(),
    maxCents: cents(),
  }),
]);
export type BudgetLineEstimate = z.infer<typeof budgetLineEstimateSchema>;

/** Why Mila proposes the line: last year had it, the checklist, a task, or typical for the event. */
/** `request`: the organizer asked for it ("we verkopen ook hotdogs"). */
export const BUDGET_LINE_ORIGINS = [
  'previous_edition',
  'checklist',
  'task',
  'typical',
  'request',
] as const;

/** A budget line Mila proposes. Only ever an estimate: she never fills in an actual amount. */
export const budgetLinePayloadSchema = z.object({
  type: z.enum(['income', 'expense']),
  title: z.string().min(1).max(200),
  origin: z.enum(BUDGET_LINE_ORIGINS),
  /** Null when nothing backs an amount: the organizer fills it in. */
  estimate: z.union([budgetLineEstimateSchema, z.null()]),
  /** This event's labels, matched by name to the previous edition's line. */
  labelIds: z.array(z.uuid()).max(20),
  /** The previous edition's supplier, unless it was archived since. */
  supplier: z.union([z.object({ id: z.uuid(), name: z.string() }), z.null()]),
  /** The event's task the cost belongs to. */
  task: z.union([z.object({ id: z.uuid(), title: z.string() }), z.null()]),
});
export type BudgetLinePayload = z.infer<typeof budgetLinePayloadSchema>;

const signedCents = () => z.number().int();

/**
 * The numbers behind Mila's insight on a budget, all computed by the server (the model only puts
 * them in words). Amounts are planned amounts: the estimate, else the actual amount.
 */
export const budgetInsightPayloadSchema = z.object({
  /**
   * What the figures are about: the current budget, the previous edition's budget scaled to this
   * one (an empty budget with history), or nothing yet.
   */
  basis: z.enum(['current', 'previous_edition', 'none']),
  expectedAttendance: z.number().int().nullable(),
  previousEdition: z.union([
    z.object({ name: z.string(), attendance: z.number().int().nullable() }),
    z.null(),
  ]),
  incomeCents: cents(),
  expenseCents: cents(),
  resultCents: signedCents(),
  /** Variable lines grow with the visitors; fixed ones don't. */
  split: z.object({
    fixedIncomeCents: cents(),
    variableIncomeCents: cents(),
    fixedExpenseCents: cents(),
    variableExpenseCents: cents(),
  }),
  /** From the previous edition's actual amounts and visitors; null without them. */
  perVisitor: z.union([
    z.object({
      incomeCents: cents(),
      expenseCents: cents(),
      lines: z.array(
        z.object({ type: z.enum(['income', 'expense']), title: z.string(), cents: cents() }),
      ),
    }),
    z.null(),
  ]),
  /** The result at fewer or more visitors: variable lines scale, fixed ones stay. */
  scenarios: z.array(
    z.object({
      attendance: z.number().int(),
      changePercent: z.number().int(),
      resultCents: signedCents(),
      differenceCents: signedCents(),
    }),
  ),
});
export type BudgetInsightPayload = z.infer<typeof budgetInsightPayloadSchema>;
