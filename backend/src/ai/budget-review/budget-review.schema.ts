import { z } from 'zod';
import { BUDGET_LINE_ORIGINS } from '../ai.types.js';

/**
 * What the model returns for a budget review. Every field is required (nullable where optional),
 * which strict structured-output modes need. There are no amounts: the server computes them from
 * the record a line is based on.
 *
 * The model gives a verdict on every previous-edition line and checklist item it is asked about
 * (is it covered, does it apply), so none is skipped; the planner turns the uncovered ones into
 * lines. `lines` is for the rest: costs of tasks, and typical lines.
 */
export const budgetReviewOutputSchema = z.object({
  previousLines: z.array(
    z.object({
      ref: z.string().describe('The previous-edition line (P3)'),
      coveredBy: z
        .string()
        .nullable()
        .describe('The current line (B2) with the same meaning, or null when there is none'),
      stillNeeded: z
        .boolean()
        .describe('False only when the records show it no longer applies to this edition'),
      title: z.string().describe('Title for the new line: last year’s, or shorter'),
      reason: z.string().describe('Why, in one or two sentences'),
    }),
  ),
  checklist: z.array(
    z.object({
      ref: z.string().describe('The checklist item (C2)'),
      applies: z.boolean().describe('Whether "applies when" holds for this event'),
      coveredBy: z
        .string()
        .nullable()
        .describe(
          'A current line (B2) or previous-edition line (P3) that is the same cost, or null',
        ),
      title: z.string().describe('Short budget line title, in the output language'),
      reason: z.string().describe('Why, in one or two sentences'),
    }),
  ),
  lines: z.array(
    z.object({
      type: z.enum(['income', 'expense']),
      title: z.string().describe('Short budget line title, in the output language'),
      origin: z.enum(BUDGET_LINE_ORIGINS),
      amountRef: z
        .string()
        .nullable()
        .describe(
          'Where the amount comes from: a previous-edition line with an actual amount (P3) or a ' +
            'checklist item (C2); null when neither fits',
        ),
      taskRef: z.string().nullable().describe('The task this cost belongs to (T2), or null'),
      reason: z.string().describe('Why this line, in one or two sentences'),
      cites: z.array(z.string()).describe('References of the records this is based on'),
    }),
  ),
  insight: z.object({
    headline: z.string().describe('One short sentence: the main thing the figures say'),
    explanation: z.string().describe('Two to four sentences explaining the computed figures'),
  }),
});

export type BudgetReviewOutput = z.infer<typeof budgetReviewOutputSchema>;
