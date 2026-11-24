'use client';

import { TriangleAlert } from 'lucide-react';
import type { SingleInputActionFn } from 'next-safe-action/hooks';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Controller, useWatch } from 'react-hook-form';
import { FormError, FormFieldError } from '@/components/form-error';
import { useOutsideSave, type OutsideSave } from '@/components/layout/modal-actions';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { LabelPicker } from '@/features/labels/label-picker';
import { useActionForm } from '@/hooks/use-action-form';

import type { ActionError } from '@/server/action-client';
import { createTask } from '@/server/tasks/actions';
import {
  EMPTY_TASK,
  EXTERNAL_ASSIGNEE,
  TASK_PRIORITIES,
  TASK_STATUSES,
  taskFormSchema,
  type TaskFormValues,
} from './schemas';
import { isDueAfterEvent } from './task-rules';
import { useTasksContext } from './tasks-context';

/** A server action that saves the form: creating a task, or accepting an AI suggestion as one. */
type TaskFormAction = SingleInputActionFn<ActionError, typeof taskFormSchema, unknown, unknown>;

/**
 * Creates a task of the event, or edits one in its modal. Only managers get here. Accepting an AI
 * task suggestion uses it too, with the suggestion filled in and its own `action`.
 * Creating, it has its own buttons. Editing with `outsideSave`, it has none: the modal saves it
 * from its bottom row (`ModalActions`), below the files.
 */
export function TaskForm({
  event,
  onDone,
  onCancel,
  action,
  defaultValues = EMPTY_TASK,
  submitLabel,
  outsideSave,
  currentAssignee,
}: {
  event: { id: string; endsAt: string };
  onDone: () => void;
  onCancel?: () => void;
  action?: TaskFormAction;
  defaultValues?: TaskFormValues;
  submitLabel?: string;
  /** Editing in a modal: saved by the button in its bottom row. */
  outsideSave?: OutsideSave;
  /** Editing: the assignee now, so someone who left the organization stays selectable. */
  currentAssignee?: { userId: string; name: string };
}) {
  const t = useTranslations();
  const router = useRouter();
  const { members, labels } = useTasksContext();
  const formerMember =
    currentAssignee && !members.some((member) => member.userId === currentAssignee.userId)
      ? currentAssignee
      : null;

  const { form, onSubmit, formError, pending } = useActionForm(
    action ?? createTask.bind(null, event.id),
    taskFormSchema,
    {
      defaultValues,
      onSuccess: () => {
        router.refresh();
        onDone();
      },
    },
  );
  const { errors } = form.formState;
  const [assignee, dueDate] = useWatch({ control: form.control, name: ['assignee', 'dueDate'] });

  useOutsideSave(outsideSave, pending);

  return (
    <form
      id={outsideSave?.formId}
      onSubmit={(e) => void onSubmit(e)}
      noValidate
      className="flex flex-col gap-6"
    >
      <FieldGroup className="gap-5">
        <Field data-invalid={!!errors.title}>
          <FieldLabel htmlFor="title">{t('taskForm.title')}</FieldLabel>
          <Input
            id="title"
            placeholder={t('taskForm.titlePlaceholder')}
            aria-invalid={!!errors.title}
            {...form.register('title')}
          />
          <FormFieldError error={errors.title} />
        </Field>

        <Field data-invalid={!!errors.description}>
          <FieldLabel htmlFor="description">{t('taskForm.description')}</FieldLabel>
          <Textarea
            id="description"
            rows={3}
            placeholder={t('taskForm.descriptionPlaceholder')}
            aria-invalid={!!errors.description}
            {...form.register('description')}
          />
          <FormFieldError error={errors.description} />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="status">{t('taskForm.status')}</FieldLabel>
            <NativeSelect id="status" {...form.register('status')}>
              {TASK_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {t(`taskStatus.${value}`)}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor="priority">{t('taskForm.priority')}</FieldLabel>
            <NativeSelect id="priority" {...form.register('priority')}>
              {TASK_PRIORITIES.map((value) => (
                <option key={value} value={value}>
                  {t(`taskPriority.${value}`)}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </div>

        <Field data-invalid={!!errors.dueDate}>
          <FieldLabel htmlFor="dueDate">{t('taskForm.dueDate')}</FieldLabel>
          <Input
            id="dueDate"
            type="date"
            aria-invalid={!!errors.dueDate}
            {...form.register('dueDate')}
          />
          {dueDate && isDueAfterEvent(dueDate, event.endsAt) && (
            <p className="flex items-start gap-2 rounded-xl bg-status-warn-bg px-3 py-2 text-sm font-semibold text-status-warn">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              {t('taskForm.dueAfterEvent')}
            </p>
          )}
          <FormFieldError error={errors.dueDate} />
        </Field>

        <Field data-invalid={!!errors.assignee}>
          <FieldLabel htmlFor="assignee">{t('taskForm.assignee')}</FieldLabel>
          <NativeSelect
            id="assignee"
            aria-invalid={!!errors.assignee}
            {...form.register('assignee')}
          >
            <option value="">{t('taskForm.nobody')}</option>
            {members.map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.name}
              </option>
            ))}
            {formerMember && (
              <option value={formerMember.userId}>
                {formerMember.name} ({t('tasks.inactive')})
              </option>
            )}
            <option value={EXTERNAL_ASSIGNEE}>{t('taskForm.external')}</option>
          </NativeSelect>
          <FormFieldError error={errors.assignee} />
        </Field>

        {assignee === EXTERNAL_ASSIGNEE && (
          <Field data-invalid={!!errors.assigneeName}>
            <FieldLabel htmlFor="assigneeName">{t('taskForm.assigneeName')}</FieldLabel>
            <Input
              id="assigneeName"
              placeholder={t('taskForm.assigneeNamePlaceholder')}
              aria-invalid={!!errors.assigneeName}
              {...form.register('assigneeName')}
            />
            <FieldDescription>{t('taskForm.assigneeNameHelp')}</FieldDescription>
            <FormFieldError error={errors.assigneeName} />
          </Field>
        )}

        <Controller
          control={form.control}
          name="labelIds"
          render={({ field }) => (
            <LabelPicker
              eventId={event.id}
              labels={labels}
              value={field.value}
              onChange={field.onChange}
              current={() => form.getValues('labelIds')}
              legend={t('taskForm.labels')}
            />
          )}
        />
      </FieldGroup>

      <FormError message={formError} />
      {!outsideSave && (
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending}>
            {submitLabel ?? t('taskForm.createButton')}
          </Button>
          {onCancel && (
            <Button type="button" variant="ghost" onClick={onCancel}>
              {t('common.cancel')}
            </Button>
          )}
        </div>
      )}
    </form>
  );
}
