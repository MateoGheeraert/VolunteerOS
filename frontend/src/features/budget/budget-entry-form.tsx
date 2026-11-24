'use client';

import type { SingleInputActionFn } from 'next-safe-action/hooks';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Controller, type FieldError, type UseFormRegisterReturn } from 'react-hook-form';
import type { Label } from '@/api/generated/types.gen';
import { FormError, FormFieldError } from '@/components/form-error';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { LabelPicker } from '@/features/labels/label-picker';
import { useActionForm } from '@/hooks/use-action-form';
import type { ActionError } from '@/server/action-client';
import { BUDGET_ENTRY_TYPES, budgetEntryFormSchema, type BudgetEntryFormValues } from './schemas';

/** A server action that saves the form: creating an entry, or saving changes to one. */
type BudgetEntryAction = SingleInputActionFn<
  ActionError,
  typeof budgetEntryFormSchema,
  unknown,
  { id: string }
>;

/**
 * Creates a budget entry (in a dialog) or edits one (in its sheet). Only managers get here.
 * Amounts are typed as text and become cents when saved.
 */
export function BudgetEntryForm({
  eventId,
  action,
  defaultValues,
  labels,
  tasks,
  submitLabel,
  onDone,
  onCancel,
}: {
  eventId: string;
  action: BudgetEntryAction;
  defaultValues: BudgetEntryFormValues;
  labels: Label[];
  /** The event's tasks, to link one. */
  tasks: { id: string; title: string }[];
  submitLabel: string;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const t = useTranslations();
  const router = useRouter();
  const { form, onSubmit, formError, pending } = useActionForm(action, budgetEntryFormSchema, {
    defaultValues,
    onSuccess: () => {
      router.refresh();
      onDone();
    },
  });
  const { errors } = form.formState;
  const isIncome = form.watch('type') === 'income';

  return (
    <form onSubmit={(e) => void onSubmit(e)} noValidate className="flex flex-col gap-6">
      <FieldGroup className="gap-5">
        <div className="grid gap-5 sm:grid-cols-[9rem_minmax(0,1fr)]">
          <Field>
            <FieldLabel htmlFor="budget-type">{t('budget.form.type')}</FieldLabel>
            <NativeSelect id="budget-type" {...form.register('type')}>
              {BUDGET_ENTRY_TYPES.map((value) => (
                <option key={value} value={value}>
                  {t(`budgetEntryType.${value}`)}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field data-invalid={!!errors.title}>
            <FieldLabel htmlFor="budget-title">{t('budget.form.title')}</FieldLabel>
            <Input
              id="budget-title"
              placeholder={
                isIncome
                  ? t('budget.form.titlePlaceholderIncome')
                  : t('budget.form.titlePlaceholderExpense')
              }
              aria-invalid={!!errors.title}
              {...form.register('title')}
            />
            <FormFieldError error={errors.title} />
          </Field>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <AmountField
            id="budget-estimated"
            label={t('budget.form.estimated')}
            error={errors.estimated}
            registration={form.register('estimated')}
          />
          <AmountField
            id="budget-actual"
            label={t('budget.form.actual')}
            error={errors.actual}
            registration={form.register('actual')}
          />
        </div>

        <Controller
          control={form.control}
          name="labelIds"
          render={({ field }) => (
            <LabelPicker
              eventId={eventId}
              labels={labels}
              value={field.value}
              onChange={field.onChange}
              current={() => form.getValues('labelIds')}
              legend={t('budget.labels')}
            />
          )}
        />

        {tasks.length > 0 && (
          <Field>
            <FieldLabel htmlFor="budget-task">{t('budget.form.task')}</FieldLabel>
            <NativeSelect id="budget-task" {...form.register('taskId')}>
              <option value="">{t('budget.form.noTask')}</option>
              {tasks.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.title}
                </option>
              ))}
            </NativeSelect>
            <FieldDescription>{t('budget.form.taskHelp')}</FieldDescription>
          </Field>
        )}

        <Field data-invalid={!!errors.notes}>
          <FieldLabel htmlFor="budget-notes">{t('budget.form.notes')}</FieldLabel>
          <Textarea
            id="budget-notes"
            rows={3}
            aria-invalid={!!errors.notes}
            {...form.register('notes')}
          />
          <FormFieldError error={errors.notes} />
        </Field>
      </FieldGroup>

      <FormError message={formError} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
        )}
      </div>
    </form>
  );
}

function AmountField({
  id,
  label,
  error,
  registration,
}: {
  id: string;
  label: string;
  error?: FieldError;
  registration: UseFormRegisterReturn;
}) {
  const t = useTranslations();
  return (
    <Field data-invalid={!!error}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="relative">
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground"
        >
          €
        </span>
        <Input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          placeholder={t('budget.form.amountPlaceholder')}
          className="pl-7 tabular-nums"
          aria-invalid={!!error}
          {...registration}
        />
      </div>
      <FormFieldError error={error} />
    </Field>
  );
}
