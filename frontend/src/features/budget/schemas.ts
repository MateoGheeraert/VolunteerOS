import { z } from 'zod';
import type { BudgetEntry, CreateBudgetEntry } from '@/api/generated/types.gen';
import { zCreateBudgetEntry } from '@/api/generated/zod.gen';
import { MAX_LABELS_PER_ITEM } from '@/features/labels/schemas';
import { msg, type MessageKey } from '@/i18n/keys';
import { centsToInput, parseEuro, splitSign, type ParseEuroError } from '@/lib/money';

/**
 * The budget entry form, shared by the form (instant feedback) and the server actions (validated
 * again). Amounts are typed as text ("12,50") and become cents through `parseEuro`.
 *
 * A sign typed before an amount decides the type, whatever is selected: "-500" makes it an
 * expense, "+500" an income. Stored amounts never carry a sign.
 */
const limits = {
  title: zCreateBudgetEntry.shape.title.maxLength ?? 200,
  notes: zCreateBudgetEntry.shape.notes.unwrap().unwrap().maxLength ?? 2000,
};

export const BUDGET_ENTRY_TYPES = zCreateBudgetEntry.shape.type.options;
export type BudgetEntryType = BudgetEntry['type'];

const amountErrors: Record<ParseEuroError, MessageKey> = {
  invalid: msg('budget.validation.amountInvalid'),
  negative: msg('budget.validation.amountInvalid'),
  tooManyDecimals: msg('budget.validation.amountDecimals'),
  tooLarge: msg('budget.validation.amountTooLarge'),
};

/** An amount as typed, optionally with + or − in front; '' is no amount. */
const amount = z.string().superRefine((value, ctx) => {
  const parsed = parseEuro(splitSign(value).amount);
  if (!parsed.ok) ctx.addIssue({ code: 'custom', message: amountErrors[parsed.error] });
});

/** Whether something was typed besides a sign: "-" alone is no amount yet. */
const hasAmount = (value: string) => splitSign(value).amount.replace(/[€\s]/g, '') !== '';

/** The type the typed signs ask for: null when no amount has one. Conflicting signs: 'conflict'. */
export function typeFromSigns(values: {
  estimated: string;
  actual: string;
}): BudgetEntryType | null | 'conflict' {
  const signs = new Set(
    [values.estimated, values.actual]
      .filter(hasAmount)
      .map((value) => splitSign(value).sign)
      .filter((sign) => sign !== null),
  );
  if (signs.size > 1) return 'conflict';
  if (signs.has('-')) return 'expense';
  if (signs.has('+')) return 'income';
  return null;
}

/** The type the entry gets: the typed signs win over the selected type. */
export function effectiveType(values: {
  type: BudgetEntryType;
  estimated: string;
  actual: string;
}): BudgetEntryType {
  const fromSigns = typeFromSigns(values);
  return fromSigns === null || fromSigns === 'conflict' ? values.type : fromSigns;
}

export const budgetEntryFormSchema = z
  .object({
    type: z.enum(BUDGET_ENTRY_TYPES),
    title: z
      .string()
      .trim()
      .min(1, msg('budget.validation.titleRequired'))
      .max(limits.title, msg('budget.validation.titleTooLong')),
    estimated: amount,
    actual: amount,
    notes: z.string().trim().max(limits.notes, msg('budget.validation.notesTooLong')),
    /** '' for no task. */
    taskId: z.string(),
    /** '' for no supplier. */
    supplierId: z.string(),
    labelIds: z.array(z.uuid()).max(MAX_LABELS_PER_ITEM),
  })
  .refine((value) => hasAmount(value.estimated) || hasAmount(value.actual), {
    message: msg('budget.validation.amountRequired'),
    path: ['estimated'],
  })
  .refine((value) => typeFromSigns(value) !== 'conflict', {
    message: msg('budget.validation.amountSignsConflict'),
    path: ['actual'],
  });

export type BudgetEntryFormValues = z.infer<typeof budgetEntryFormSchema>;

/** Which form field a Nest validation error on an API field belongs to. */
export const budgetApiFields = { estimatedCents: 'estimated', actualCents: 'actual' };

export const emptyBudgetEntry = (type: BudgetEntryType): BudgetEntryFormValues => ({
  type,
  title: '',
  estimated: '',
  actual: '',
  notes: '',
  taskId: '',
  supplierId: '',
  labelIds: [],
});

/** An existing entry → the form, to edit it. */
export const budgetEntryToForm = (entry: BudgetEntry): BudgetEntryFormValues => ({
  type: entry.type,
  title: entry.title,
  estimated: centsToInput(entry.estimatedCents),
  actual: centsToInput(entry.actualCents),
  notes: entry.notes ?? '',
  taskId: entry.task?.id ?? '',
  supplierId: entry.supplier?.id ?? '',
  labelIds: entry.labelIds,
});

const centsOf = (value: string): number | null => {
  const parsed = parseEuro(splitSign(value).amount);
  if (!parsed.ok) throw new Error(`Unparsed amount reached the API body: ${value}`);
  return parsed.cents;
};

/** Validated form values → the API body (for creating, and as a full update). */
export function toBudgetEntryBody(values: BudgetEntryFormValues): Required<CreateBudgetEntry> {
  return {
    type: effectiveType(values),
    title: values.title,
    estimatedCents: centsOf(values.estimated),
    actualCents: centsOf(values.actual),
    notes: values.notes || null,
    taskId: values.taskId || null,
    supplierId: values.supplierId || null,
    labelIds: values.labelIds,
  };
}
