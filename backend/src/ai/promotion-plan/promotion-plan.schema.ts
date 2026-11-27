import { z } from 'zod';
import { PROMO_ACTION_TYPES, PROMO_EFFORTS } from '../ai.types.js';

/**
 * What the model returns for a promotion-plan run. Every field is required, which strict
 * structured-output modes need. `cites` are the short references from the prompt (C3, P1); the
 * server maps them back to catalogue actions and tasks.
 */
export const promotionPlanOutputSchema = z.object({
  actions: z.array(
    z.object({
      title: z.string().describe('Short action title, in the output language'),
      type: z.enum(PROMO_ACTION_TYPES),
      audience: z.string().describe('Which target groups it reaches, in a few words'),
      weeksBefore: z.number().int().describe('Whole weeks before the event starts'),
      estimatedCostEuros: z.number().int().describe('Estimated cost in whole euros; 0 when free'),
      effort: z.enum(PROMO_EFFORTS),
      why: z.string().describe('Why it fits this event, in one or two sentences'),
      howTo: z.string().describe('Numbered steps, adapted to this event'),
      cites: z.array(z.string()).describe('References of the records this is based on'),
    }),
  ),
});

export type PromotionPlanOutput = z.infer<typeof promotionPlanOutputSchema>;
