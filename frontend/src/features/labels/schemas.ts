import { z } from 'zod';
import type { Label } from '@/api/generated/types.gen';
import { zCreateLabel } from '@/api/generated/zod.gen';
import { msg } from '@/i18n/keys';

/**
 * The label form, shared by the forms (instant feedback) and the server actions (validated
 * again). Limits and colors come from the generated API schema, so they follow the backend.
 */
export const LABEL_NAME_MAX = zCreateLabel.shape.name.maxLength ?? 50;
/** The most labels one task or budget entry can carry (backend: MAX_LABELS_PER_ITEM). */
export const MAX_LABELS_PER_ITEM = 20;

export const LABEL_COLORS = zCreateLabel.shape.color.unwrap().options;
export type LabelColor = Label['color'];

export const labelFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, msg('labels.validation.nameRequired'))
    .max(LABEL_NAME_MAX, msg('labels.validation.nameTooLong')),
  color: z.enum(LABEL_COLORS),
});
export type LabelFormValues = z.infer<typeof labelFormSchema>;

/** New labels cycle through the palette, so neighbours differ; the label manager can recolor. */
export const nextLabelColor = (index: number): LabelColor =>
  LABEL_COLORS[(index + 1) % LABEL_COLORS.length]!;
