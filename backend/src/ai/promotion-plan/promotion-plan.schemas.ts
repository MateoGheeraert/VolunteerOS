import { z } from 'zod';
import { createTaskSchema } from '../../features/tasks/tasks.schemas.js';

/** API contracts for Mila's promotion plan (docs/info.md §7.11). */

/** "Maak promotieplan", optionally steered: "meer Instagram, geen drukwerk". */
export const requestPromotionPlanSchema = z
  .object({ instruction: z.string().trim().max(500).optional() })
  .meta({ id: 'RequestPromotionPlan' });
export type RequestPromotionPlanInput = z.infer<typeof requestPromotionPlanSchema>;

/**
 * Accepting promo actions: each as a task (as edited in the dialog, or as suggested), with an
 * estimated expense for its cost when `addBudgetLine` is set.
 */
export const acceptPromoActionsSchema = z
  .object({
    items: z
      .array(
        z.object({
          suggestionId: z.uuid(),
          task: createTaskSchema,
          addBudgetLine: z.boolean(),
        }),
      )
      .min(1)
      .max(20),
  })
  .meta({ id: 'AcceptPromoActions' });
export type AcceptPromoActionsInput = z.infer<typeof acceptPromoActionsSchema>;
