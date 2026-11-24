'use client';

import type { SingleInputActionFn } from 'next-safe-action/hooks';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { FormError, FormFieldError } from '@/components/form-error';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { useActionForm } from '@/hooks/use-action-form';
import type { ActionError } from '@/server/action-client';
import { SUPPLIER_CATEGORIES, supplierFormSchema, type SupplierFormValues } from './schemas';

/** A server action that saves the form: creating a supplier, or saving changes to one. */
type SupplierAction = SingleInputActionFn<
  ActionError,
  typeof supplierFormSchema,
  unknown,
  { id: string; name: string }
>;

/**
 * Creates a supplier (in a dialog) or edits one (in its modal). Only the name and the category
 * are required; the contact details can follow later.
 */
export function SupplierForm({
  action,
  defaultValues,
  submitLabel,
  onDone,
  onCancel,
}: {
  action: SupplierAction;
  defaultValues: SupplierFormValues;
  submitLabel: string;
  onDone: (supplier: { id: string; name: string }) => void;
  onCancel?: () => void;
}) {
  const t = useTranslations();
  const router = useRouter();
  const { form, onSubmit, formError, pending } = useActionForm(action, supplierFormSchema, {
    defaultValues,
    onSuccess: (data) => {
      router.refresh();
      onDone(data);
    },
  });
  const { errors } = form.formState;

  return (
    <form
      onSubmit={(e) => {
        // The picker's dialog sits inside the budget entry form: don't submit that one too.
        e.stopPropagation();
        void onSubmit(e);
      }}
      noValidate
      className="flex flex-col gap-6"
    >
      <FieldGroup className="gap-5">
        <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_12rem]">
          <Field data-invalid={!!errors.name}>
            <FieldLabel htmlFor="supplier-name">{t('suppliers.form.name')}</FieldLabel>
            <Input
              id="supplier-name"
              placeholder={t('suppliers.form.namePlaceholder')}
              aria-invalid={!!errors.name}
              {...form.register('name')}
            />
            <FormFieldError error={errors.name} />
          </Field>
          <Field data-invalid={!!errors.category}>
            <FieldLabel htmlFor="supplier-category">{t('suppliers.form.category')}</FieldLabel>
            <NativeSelect
              id="supplier-category"
              aria-invalid={!!errors.category}
              {...form.register('category')}
            >
              <option value="" disabled>
                {t('suppliers.form.chooseCategory')}
              </option>
              {SUPPLIER_CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {t(`supplierCategory.${value}`)}
                </option>
              ))}
            </NativeSelect>
            <FormFieldError error={errors.category} />
          </Field>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field data-invalid={!!errors.contactName}>
            <FieldLabel htmlFor="supplier-contact">{t('suppliers.form.contactName')}</FieldLabel>
            <Input
              id="supplier-contact"
              autoComplete="off"
              aria-invalid={!!errors.contactName}
              {...form.register('contactName')}
            />
            <FormFieldError error={errors.contactName} />
          </Field>
          <Field data-invalid={!!errors.phone}>
            <FieldLabel htmlFor="supplier-phone">{t('suppliers.form.phone')}</FieldLabel>
            <Input
              id="supplier-phone"
              type="tel"
              autoComplete="off"
              aria-invalid={!!errors.phone}
              {...form.register('phone')}
            />
            <FormFieldError error={errors.phone} />
          </Field>
          <Field data-invalid={!!errors.email}>
            <FieldLabel htmlFor="supplier-email">{t('suppliers.form.email')}</FieldLabel>
            <Input
              id="supplier-email"
              type="email"
              autoComplete="off"
              aria-invalid={!!errors.email}
              {...form.register('email')}
            />
            <FormFieldError error={errors.email} />
          </Field>
          <Field data-invalid={!!errors.website}>
            <FieldLabel htmlFor="supplier-website">{t('suppliers.form.website')}</FieldLabel>
            <Input
              id="supplier-website"
              inputMode="url"
              autoComplete="off"
              placeholder="www.voorbeeld.be"
              aria-invalid={!!errors.website}
              {...form.register('website')}
            />
            <FormFieldError error={errors.website} />
          </Field>
        </div>

        <Field data-invalid={!!errors.notes}>
          <FieldLabel htmlFor="supplier-notes">{t('suppliers.form.notes')}</FieldLabel>
          <Textarea
            id="supplier-notes"
            rows={3}
            placeholder={t('suppliers.form.notesPlaceholder')}
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
