import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import { dateTimeOutput } from '../../common/schemas.js';
import { budgetEntry, MAX_BUDGET_CENTS } from '../../db/schema/index.js';
import { labelIdsSchema } from '../labels/labels.schemas.js';

/**
 * API contracts for an event's budget entries, derived from the Drizzle table. Amounts are whole
 * euro cents (integers, never floats), from 0 to € 9.999.999,99.
 */

const cents = () => z.number().int().min(0).max(MAX_BUDGET_CENTS);

const entryInput = createInsertSchema(budgetEntry, {
  title: (schema) => schema.trim().min(1).max(200),
  notes: (schema) => schema.trim().max(2000),
  estimatedCents: cents,
  actualCents: cents,
});

// Fields a client may set. The event, the creator and timestamps are always set by the server.
const editableFields = {
  type: true,
  title: true,
  estimatedCents: true,
  actualCents: true,
  notes: true,
  taskId: true,
} as const;

/** An entry needs at least one amount: the estimate, the actual amount, or both. */
export const hasAmount = (value: { estimatedCents?: number | null; actualCents?: number | null }) =>
  (value.estimatedCents !== undefined && value.estimatedCents !== null) ||
  (value.actualCents !== undefined && value.actualCents !== null);
export const AMOUNT_REQUIRED = 'estimatedCents: set the estimated or the actual amount';

export const createBudgetEntrySchema = entryInput
  .pick(editableFields)
  .extend({ labelIds: labelIdsSchema.optional() })
  .refine(hasAmount, { message: AMOUNT_REQUIRED, path: ['estimatedCents'] })
  .meta({ id: 'CreateBudgetEntry' });
export type CreateBudgetEntryInput = z.infer<typeof createBudgetEntrySchema>;

/**
 * A partial update; `null` clears an optional field. The service checks the entry still has an
 * amount afterwards. `labelIds` replaces the entry's labels.
 */
export const updateBudgetEntrySchema = entryInput
  .pick(editableFields)
  .extend({ labelIds: labelIdsSchema })
  .partial()
  .meta({ id: 'UpdateBudgetEntry' });
export type UpdateBudgetEntryInput = z.infer<typeof updateBudgetEntrySchema>;

export const budgetEntrySchema = createSelectSchema(budgetEntry, {
  createdAt: dateTimeOutput,
  updatedAt: dateTimeOutput,
})
  // Soft deletion is internal; the task is returned resolved below.
  .omit({ deletedAt: true, createdByUserId: true, taskId: true })
  .extend({
    /** The linked task, when there is one the caller may see. */
    task: z.object({ id: z.uuid(), title: z.string() }).nullable(),
    labelIds: z.array(z.uuid()),
    /** How many files (invoices, receipts) are attached. */
    fileCount: z.number().int(),
  })
  .meta({ id: 'BudgetEntry' });
export type BudgetEntryDto = z.infer<typeof budgetEntrySchema>;
