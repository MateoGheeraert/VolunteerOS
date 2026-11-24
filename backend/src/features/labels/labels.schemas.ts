import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import { dateTimeOutput } from '../../common/schemas.js';
import { label } from '../../db/schema/index.js';

/** API contracts for an event's labels, shared by tasks and budget entries. */

/** The most labels one task or budget entry can carry. */
export const MAX_LABELS_PER_ITEM = 20;

/** The label ids on a task or budget entry. */
export const labelIdsSchema = z.array(z.uuid()).max(MAX_LABELS_PER_ITEM);

const labelInput = createInsertSchema(label, {
  name: (schema) => schema.trim().min(1).max(50),
});

export const createLabelSchema = labelInput
  .pick({ name: true, color: true })
  .meta({ id: 'CreateLabel' });
export type CreateLabelInput = z.infer<typeof createLabelSchema>;

export const updateLabelSchema = labelInput
  .pick({ name: true, color: true })
  .partial()
  .meta({ id: 'UpdateLabel' });
export type UpdateLabelInput = z.infer<typeof updateLabelSchema>;

export const labelSchema = createSelectSchema(label, {
  createdAt: dateTimeOutput,
  updatedAt: dateTimeOutput,
})
  .omit({ deletedAt: true })
  .meta({ id: 'Label' });
export type LabelDto = z.infer<typeof labelSchema>;

/** What carries the label: shown before deleting it, since deleting takes it off all of them. */
export const labelUsageSchema = z
  .object({ tasks: z.number().int(), budgetEntries: z.number().int() })
  .meta({ id: 'LabelUsage' });
export type LabelUsageDto = z.infer<typeof labelUsageSchema>;
