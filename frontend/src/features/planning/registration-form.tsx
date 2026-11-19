'use client';

import { Check, Copy } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import type { Event } from '@/api/generated/types.gen';
import { FormError, FormFieldError } from '@/components/form-error';
import { Button } from '@/components/ui/button';
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useActionForm } from '@/hooks/use-action-form';
import { updateRegistration } from '@/server/planning/actions';
import { registrationFormSchema, toRegistrationFormValues } from './schemas';

/** The public link of an event, as people open it. */
export const publicLink = (slug: string) =>
  typeof window === 'undefined' ? `/e/${slug}` : `${window.location.origin}/e/${slug}`;

/** A copy button for the public link. */
export function CopyLink({ slug }: { slug: string }) {
  const t = useTranslations();
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      onClick={() => {
        void navigator.clipboard.writeText(publicLink(slug)).then(() => {
          setCopied(true);
          toast.success(t('planning.registration.copied'));
          setTimeout(() => setCopied(false), 2000);
        });
      }}
    >
      {copied ? (
        <Check data-icon="inline-start" aria-hidden />
      ) : (
        <Copy data-icon="inline-start" aria-hidden />
      )}
      {t('planning.registration.copy')}
    </Button>
  );
}

/**
 * Registration settings: open or closed, the deadline, and what is asked of each volunteer.
 * Opening it the first time gives the event its public link.
 */
export function RegistrationForm({ event, onDone }: { event: Event; onDone: () => void }) {
  const t = useTranslations();
  const { form, onSubmit, formError, pending } = useActionForm(
    updateRegistration.bind(null, event.id),
    registrationFormSchema,
    {
      defaultValues: toRegistrationFormValues(event),
      onSuccess: () => {
        toast.success(t('planning.saved'));
        onDone();
      },
    },
  );
  const { errors } = form.formState;
  const commitment = useWatch({ control: form.control, name: 'volunteerCommitment' });

  return (
    <form onSubmit={(e) => void onSubmit(e)} noValidate className="flex flex-col gap-5">
      {event.status !== 'published' && (
        <p className="rounded-xl bg-status-warn-bg px-3.5 py-2.5 text-sm font-semibold text-status-warn">
          {t('planning.registration.notPublished')}
        </p>
      )}
      <FieldGroup className="gap-5">
        <label className="flex items-start gap-3 rounded-xl bg-muted/60 px-3.5 py-3">
          <input
            type="checkbox"
            className="mt-0.5 size-5 accent-primary"
            {...form.register('registrationOpen')}
          />
          <span className="flex flex-col gap-0.5">
            <span className="text-sm font-bold">{t('planning.registration.open')}</span>
            <span className="text-sm text-muted-foreground">
              {t('planning.registration.openHelp')}
            </span>
          </span>
        </label>

        {event.publicSlug && (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-bold">{t('planning.registration.link')}</span>
            <div className="flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg bg-muted px-2.5 py-1.5 text-sm">
                {publicLink(event.publicSlug)}
              </code>
              <CopyLink slug={event.publicSlug} />
            </div>
          </div>
        )}

        <FieldSet className="gap-3">
          <FieldLegend className="mb-0 text-sm">{t('planning.registration.deadline')}</FieldLegend>
          <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-3">
            <Input
              type="date"
              aria-label={t('planning.registration.deadlineDate')}
              {...form.register('deadlineDate')}
            />
            <Input
              type="time"
              step={300}
              aria-label={t('planning.registration.deadlineTime')}
              aria-invalid={!!errors.deadlineTime}
              {...form.register('deadlineTime')}
            />
          </div>
          <FieldDescription>{t('planning.registration.deadlineHelp')}</FieldDescription>
          <FormFieldError error={errors.deadlineTime} />
        </FieldSet>

        <FieldSet className="gap-3">
          <FieldLegend className="mb-0 text-sm">
            {t('planning.registration.commitment')}
          </FieldLegend>
          <label className="flex items-center gap-3 text-sm">
            <input
              type="radio"
              value="shifts"
              className="size-4 accent-primary"
              {...form.register('volunteerCommitment')}
            />
            {t('planning.registration.commitmentShifts')}
          </label>
          <label className="flex items-center gap-3 text-sm">
            <input
              type="radio"
              value="whole_event"
              className="size-4 accent-primary"
              {...form.register('volunteerCommitment')}
            />
            {t('planning.registration.commitmentWholeEvent')}
          </label>
        </FieldSet>

        {commitment === 'shifts' && (
          <Field data-invalid={!!errors.shiftsPerVolunteer} className="max-w-48">
            <FieldLabel htmlFor="shifts-per-volunteer">
              {t('planning.registration.shiftsPerVolunteer')}
            </FieldLabel>
            <Input
              id="shifts-per-volunteer"
              inputMode="numeric"
              aria-invalid={!!errors.shiftsPerVolunteer}
              {...form.register('shiftsPerVolunteer')}
            />
            <FormFieldError error={errors.shiftsPerVolunteer} />
          </Field>
        )}
      </FieldGroup>
      <FormError message={formError} />
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {t('common.save')}
        </Button>
      </div>
    </form>
  );
}
