import { z } from 'zod';
import type { AiSuggestion, Label } from '@/api/generated/types.gen';
import type { BudgetEntryFormValues } from '@/features/budget/schemas';
import { MAX_LABELS_PER_ITEM } from '@/features/labels/schemas';
import { msg } from '@/i18n/keys';
import type { TaskFormValues } from '@/features/tasks/schemas';
import { EMPTY_TASK } from '@/features/tasks/schemas';
import { centsToInput } from '@/lib/money';

export type TaskSuggestion = Extract<AiSuggestion, { kind: 'task_suggestion' }>;
export type QuestionSuggestion = Extract<AiSuggestion, { kind: 'question' }>;
export type EventUpdateSuggestion = Extract<AiSuggestion, { kind: 'update_event' }>;
export type BudgetLineSuggestion = Extract<AiSuggestion, { kind: 'budget_line' }>;
export type BudgetInsightSuggestion = Extract<AiSuggestion, { kind: 'budget_insight' }>;

export const answerSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, msg('ai.validation.answerRequired'))
    .max(1000, msg('ai.validation.answerTooLong')),
});
export type AnswerValues = z.infer<typeof answerSchema>;

export const eventUpdateSchema = z.object({
  value: z.string().trim().min(1, msg('ai.validation.valueRequired')).max(2000),
});

/** Accepting task suggestions without editing them: the suggestion is the task. */
export const acceptAsIsSchema = z.object({
  items: z
    .array(
      z.object({
        suggestionId: z.uuid(),
        title: z.string().min(1).max(200),
        description: z.string().max(2000).nullable(),
        priority: z.enum(['low', 'medium', 'high']),
        dueDate: z.string().nullable(),
      }),
    )
    .min(1)
    .max(20),
});

export const asIsItem = (suggestion: TaskSuggestion) => ({
  suggestionId: suggestion.id,
  ...suggestion.payload,
});

/** The task dialog, filled in with the suggestion. */
export const suggestionToTaskForm = (suggestion: TaskSuggestion): TaskFormValues => ({
  ...EMPTY_TASK,
  title: suggestion.payload.title,
  description: suggestion.payload.description ?? '',
  priority: suggestion.payload.priority,
  dueDate: suggestion.payload.dueDate ?? '',
});

/** "Help me taken maken": the organizer's list. */
export const draftTextSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, msg('ai.validation.listRequired'))
    .max(4000, msg('ai.validation.listTooLong')),
});

/** The drafted tasks the organizer keeps, as they edited them in the dialog. */
export const createDraftTasksSchema = z.object({
  tasks: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(200),
        description: z.string().max(2000).nullable(),
        priority: z.enum(['low', 'medium', 'high']),
        dueDate: z.string().nullable(),
        assigneeUserId: z.string().nullable(),
        assigneeName: z.string().max(200).nullable(),
      }),
    )
    .min(1)
    .max(30),
});

/**
 * The budget line form, filled in with Mila's line: her estimate (never an actual amount), the
 * labels that still exist, the supplier and the task.
 */
/**
 * The suppliers (not archived) and tasks that can still be picked now. Mila's line may name ones
 * archived or deleted since the review; those are left out rather than refused on save.
 */
export interface PickableNow {
  supplierIds: ReadonlySet<string>;
  taskIds: ReadonlySet<string>;
}

const stillPickable = (id: string | undefined, ids: ReadonlySet<string> | undefined) =>
  id && (!ids || ids.has(id)) ? id : null;

export const budgetLineToForm = (
  suggestion: BudgetLineSuggestion,
  labels: Pick<Label, 'id'>[],
  pickable?: PickableNow,
): BudgetEntryFormValues => {
  const { payload } = suggestion;
  const existing = new Set(labels.map((label) => label.id));
  return {
    type: payload.type,
    title: payload.title,
    estimated: centsToInput(payload.estimate?.cents ?? null),
    actual: '',
    notes: '',
    taskId: stillPickable(payload.task?.id, pickable?.taskIds) ?? '',
    supplierId: stillPickable(payload.supplier?.id, pickable?.supplierIds) ?? '',
    labelIds: payload.labelIds.filter((id) => existing.has(id)),
  };
};

/** Adding budget lines as Mila proposed them; only lines with an estimate can be. */
export const acceptBudgetLinesAsIsSchema = z.object({
  items: z
    .array(
      z.object({
        suggestionId: z.uuid(),
        type: z.enum(['income', 'expense']),
        title: z.string().min(1).max(200),
        estimatedCents: z.number().int().min(0),
        labelIds: z.array(z.uuid()).max(MAX_LABELS_PER_ITEM),
        supplierId: z.uuid().nullable(),
        taskId: z.uuid().nullable(),
      }),
    )
    .min(1)
    .max(20),
});
export type AcceptBudgetLineAsIs = z.infer<typeof acceptBudgetLinesAsIsSchema>['items'][number];

/** A line with an estimate, as proposed; null for one without (it goes through the form). */
export function budgetLineAsIsItem(
  suggestion: BudgetLineSuggestion,
  labels: Pick<Label, 'id'>[],
  pickable?: PickableNow,
): AcceptBudgetLineAsIs | null {
  const { payload } = suggestion;
  if (!payload.estimate) return null;
  const existing = new Set(labels.map((label) => label.id));
  return {
    suggestionId: suggestion.id,
    type: payload.type,
    title: payload.title,
    estimatedCents: payload.estimate.cents,
    labelIds: payload.labelIds.filter((id) => existing.has(id)),
    supplierId: stillPickable(payload.supplier?.id, pickable?.supplierIds),
    taskId: stillPickable(payload.task?.id, pickable?.taskIds),
  };
}
