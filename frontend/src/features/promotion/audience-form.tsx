'use client';

import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Controller, useWatch } from 'react-hook-form';
import { FormError, FormFieldError } from '@/components/form-error';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { useActionForm } from '@/hooks/use-action-form';
import { cn } from '@/lib/utils';
import { updateAudience } from '@/server/promotion/actions';
import { AUDIENCE_OPTIONS, audienceFormSchema, type AudienceFormValues } from './schemas';

/** The Publiek, in its dialog: who the event is for and what there is to spend on promotion. */
export function AudienceForm({
  eventId,
  defaultValues,
  onDone,
  onCancel,
}: {
  eventId: string;
  defaultValues: AudienceFormValues;
  onDone: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations('promotion');
  const tc = useTranslations('common');
  const router = useRouter();
  const { form, onSubmit, formError, pending } = useActionForm(
    updateAudience.bind(null, eventId),
    audienceFormSchema,
    {
      defaultValues,
      onSuccess: () => {
        router.refresh();
        onDone();
      },
    },
  );
  const { errors } = form.formState;
  const entry = useWatch({ control: form.control, name: 'entry' });

  return (
    <form onSubmit={(e) => void onSubmit(e)} noValidate className="flex flex-col gap-6">
      <FieldGroup className="gap-5">
        <Controller
          control={form.control}
          name="audiences"
          render={({ field }) => (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-bold">{t('audience.audiences')}</legend>
              <div className="flex flex-wrap gap-1.5">
                {AUDIENCE_OPTIONS.map((option) => {
                  const selected = field.value.includes(option);
                  return (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={selected}
                      onClick={() =>
                        field.onChange(
                          selected
                            ? field.value.filter((value) => value !== option)
                            : [...field.value, option],
                        )
                      }
                      className={cn(
                        'inline-flex h-8 items-center gap-1 rounded-full border px-3 text-sm font-bold transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                        selected
                          ? 'border-transparent bg-brand-tint text-primary'
                          : 'border-border text-muted-foreground hover:bg-muted',
                      )}
                    >
                      {selected && <Check className="size-3.5" aria-hidden />}
                      {t(`audienceOption.${option}`)}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          )}
        />

        <Field data-invalid={!!errors.description}>
          <FieldLabel htmlFor="audience-description">{t('audience.description')}</FieldLabel>
          <Textarea
            id="audience-description"
            rows={2}
            placeholder={t('audience.descriptionPlaceholder')}
            aria-invalid={!!errors.description}
            {...form.register('description')}
          />
          <FormFieldError error={errors.description} />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-bold">{t('audience.ages')}</legend>
            <div className="grid grid-cols-2 gap-2">
              <Field data-invalid={!!errors.ageMin}>
                <FieldLabel htmlFor="age-min" className="text-xs text-muted-foreground">
                  {t('audience.ageMin')}
                </FieldLabel>
                <Input
                  id="age-min"
                  inputMode="numeric"
                  aria-invalid={!!errors.ageMin}
                  {...form.register('ageMin')}
                />
                <FormFieldError error={errors.ageMin} />
              </Field>
              <Field data-invalid={!!errors.ageMax}>
                <FieldLabel htmlFor="age-max" className="text-xs text-muted-foreground">
                  {t('audience.ageMax')}
                </FieldLabel>
                <Input
                  id="age-max"
                  inputMode="numeric"
                  aria-invalid={!!errors.ageMax}
                  {...form.register('ageMax')}
                />
                <FormFieldError error={errors.ageMax} />
              </Field>
            </div>
          </fieldset>
          <Field data-invalid={!!errors.region}>
            <FieldLabel htmlFor="audience-region">{t('audience.region')}</FieldLabel>
            <Input
              id="audience-region"
              placeholder={t('audience.regionPlaceholder')}
              aria-invalid={!!errors.region}
              {...form.register('region')}
            />
            <FormFieldError error={errors.region} />
          </Field>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="audience-entry">{t('audience.entry')}</FieldLabel>
            <NativeSelect id="audience-entry" {...form.register('entry')}>
              <option value="">{t('audience.notFilled')}</option>
              <option value="free">{t('audience.free')}</option>
              <option value="paid">{t('audience.paid')}</option>
            </NativeSelect>
          </Field>
          {entry === 'paid' && (
            <Field data-invalid={!!errors.price}>
              <FieldLabel htmlFor="audience-price">{t('audience.price')}</FieldLabel>
              <Input
                id="audience-price"
                inputMode="decimal"
                placeholder="€ 0,00"
                aria-invalid={!!errors.price}
                {...form.register('price')}
              />
              <FormFieldError error={errors.price} />
            </Field>
          )}
        </div>

        <Field data-invalid={!!errors.pitch}>
          <FieldLabel htmlFor="audience-pitch">{t('audience.pitch')}</FieldLabel>
          <Textarea
            id="audience-pitch"
            rows={3}
            aria-invalid={!!errors.pitch}
            {...form.register('pitch')}
          />
          <FieldDescription>{t('audience.pitchHelp')}</FieldDescription>
          <FormFieldError error={errors.pitch} />
        </Field>

        <Field data-invalid={!!errors.budget}>
          <FieldLabel htmlFor="audience-budget">{t('audience.budget')}</FieldLabel>
          <Input
            id="audience-budget"
            inputMode="decimal"
            placeholder="€ 0,00"
            className="sm:max-w-48"
            aria-invalid={!!errors.budget}
            {...form.register('budget')}
          />
          <FieldDescription>{t('audience.budgetHelp')}</FieldDescription>
          <FormFieldError error={errors.budget} />
        </Field>
        <p className="text-sm text-muted-foreground">{t('audience.reused')}</p>
      </FieldGroup>

      <FormError message={formError} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {t('audience.save')}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          {tc('cancel')}
        </Button>
      </div>
    </form>
  );
}
