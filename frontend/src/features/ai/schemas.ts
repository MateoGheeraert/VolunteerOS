import { z } from 'zod';
import type { AiSuggestion } from '@/api/generated/types.gen';
import { msg } from '@/i18n/keys';
import type { TaskFormValues } from '@/features/tasks/schemas';
import { EMPTY_TASK } from '@/features/tasks/schemas';

export type TaskSuggestion = Extract<AiSuggestion, { kind: 'task_suggestion' }>;
export type QuestionSuggestion = Extract<AiSuggestion, { kind: 'question' }>;
export type EventUpdateSuggestion = Extract<AiSuggestion, { kind: 'update_event' }>;

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
