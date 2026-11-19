'use client';

import { Plus, TriangleAlert } from 'lucide-react';
import { useAction, type SingleInputActionFn } from 'next-safe-action/hooks';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Controller, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import type { TaskLabel } from '@/api/generated/types.gen';
import { FormError, FormFieldError } from '@/components/form-error';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { useActionForm } from '@/hooks/use-action-form';
import { cn } from '@/lib/utils';
import type { ActionError } from '@/server/action-client';
import { createTask, createTaskLabel } from '@/server/tasks/actions';
import {
  EMPTY_TASK,
  EXTERNAL_ASSIGNEE,
  TASK_PRIORITIES,
  TASK_STATUSES,
  taskFormSchema,
  type TaskFormValues,
} from './schemas';
import { LabelChip, labelColorClasses } from './task-badges';
import { isDueAfterEvent } from './task-rules';
import { useTasksContext } from './tasks-context';

/** A server action that saves the form: creating a task, or accepting an AI suggestion as one. */
type TaskFormAction = SingleInputActionFn<ActionError, typeof taskFormSchema, unknown, unknown>;

/**
 * Creates a task of the event. Only managers get here. Existing tasks are edited field by field
 * in the task pane (inline), not with this form. Accepting an AI task suggestion uses it too, with
 * the suggestion filled in and its own `action`.
 */
export function TaskForm({
  event,
  onDone,
  onCancel,
  action,
  defaultValues = EMPTY_TASK,
  submitLabel,
}: {
  event: { id: string; endsAt: string };
  onDone: () => void;
  onCancel: () => void;
  action?: TaskFormAction;
  defaultValues?: TaskFormValues;
  submitLabel?: string;
}) {
  const t = useTranslations();
  const router = useRouter();
  const { members, labels } = useTasksContext();

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

  return (
    <form onSubmit={(e) => void onSubmit(e)} noValidate className="flex flex-col gap-6">
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
            />
          )}
        />
      </FieldGroup>

      <FormError message={formError} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {submitLabel ?? t('taskForm.createButton')}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  );
}

/** Toggle the event's labels on the task; managers can add a new one on the spot. */
function LabelPicker({
  eventId,
  labels,
  value,
  onChange,
  current,
}: {
  eventId: string;
  labels: TaskLabel[];
  value: string[];
  onChange: (ids: string[]) => void;
  /** The selection right now: creating a label is async, and others may be toggled meanwhile. */
  current: () => string[];
}) {
  const t = useTranslations();
  const router = useRouter();
  const [name, setName] = useState('');
  // Labels made in this form, until the page data includes them.
  const [added, setAdded] = useState<TaskLabel[]>([]);
  const all = [...labels, ...added.filter((a) => !labels.some((l) => l.id === a.id))];

  const create = useAction(createTaskLabel.bind(null, eventId), {
    onSuccess: ({ data }) => {
      if (!data) return;
      setAdded((current) => [...current, data]);
      onChange([...current(), data.id]);
      setName('');
      router.refresh();
    },
    onError: ({ error }) => toast.error(t(error.serverError?.message ?? 'common.genericError')),
  });
  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  const add = () => {
    if (name.trim()) create.execute({ name, color: nextColor(all.length) });
  };

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-bold">{t('taskForm.labels')}</legend>
      {all.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {all.map((label) => {
            const selected = value.includes(label.id);
            return (
              <button
                key={label.id}
                type="button"
                aria-pressed={selected}
                onClick={() => toggle(label.id)}
                className={cn(
                  'rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                  !selected && 'opacity-45 hover:opacity-80',
                )}
              >
                <LabelChip label={label} className={cn(selected && 'ring-2 ring-current/40')} />
              </button>
            );
          })}
        </div>
      )}
      <div className="flex gap-2">
        <Input
          aria-label={t('taskLabels.newLabel')}
          placeholder={t('taskLabels.newLabelPlaceholder')}
          value={name}
          maxLength={50}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              add();
            }
          }}
        />
        <Button
          type="button"
          variant="secondary"
          disabled={!name.trim() || create.isPending}
          onClick={add}
        >
          <Plus data-icon="inline-start" aria-hidden />
          {t('taskLabels.add')}
        </Button>
      </div>
    </fieldset>
  );
}

/** New labels cycle through the palette, so neighbours differ; the label manager can recolor. */
const PALETTE = Object.keys(labelColorClasses) as (keyof typeof labelColorClasses)[];
export const nextColor = (index: number) => PALETTE[(index + 1) % PALETTE.length]!;
