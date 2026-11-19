'use client';

import { CircleCheckBig, MapPin, Star } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Controller, useWatch } from 'react-hook-form';
import type { PublicEvent } from '@/api/generated/types.gen';
import { FormError, FormFieldError } from '@/components/form-error';
import { IconBlob } from '@/components/layout/icon-blob';
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
import { Textarea } from '@/components/ui/textarea';
import { shiftDay } from '@/features/planning/planning-rules';
import {
  publicRegistrationFormSchemaFor,
  type PublicRegistrationFormValues,
} from '@/features/planning/schemas';
import { useActionForm } from '@/hooks/use-action-form';
import { formatShiftTime, formatShortDay } from '@/lib/format';
import { cn } from '@/lib/utils';
import { registerVolunteer } from '@/server/planning/actions';

const EMPTY: PublicRegistrationFormValues = {
  name: '',
  email: '',
  phone: '',
  availableShiftIds: [],
  wholeEvent: false,
  preferredTeamId: '',
  notes: '',
  consent: false,
  website: '',
};

/**
 * The volunteer's sign-up: who they are, which shifts they can do, which team they'd like and
 * anything else. Picking shifts is a wish, not a booking: the organizers make the schedule.
 */
export function PublicRegistrationForm({ slug, event }: { slug: string; event: PublicEvent }) {
  const t = useTranslations();
  const [done, setDone] = useState<string | null>(null);
  const wholeEventOnly = event.volunteerCommitment === 'whole_event';
  const {
    form,
    onSubmit,
    formError,
    pending: isPending,
  } = useActionForm(
    registerVolunteer.bind(null, slug),
    publicRegistrationFormSchemaFor(event.requiredShifts, event.volunteerCommitment),
    { defaultValues: EMPTY, onSuccess: (_, input) => setDone(input.email) },
  );
  const { errors } = form.formState;
  const wholeEvent = useWatch({ control: form.control, name: 'wholeEvent' });
  const picked = useWatch({ control: form.control, name: 'availableShiftIds' });

  if (done) {
    return (
      <output className="flex flex-col items-start gap-3">
        <IconBlob icon={CircleCheckBig} tone="ok" size="lg" />
        <h2 className="text-2xl">{t('register.thanksTitle')}</h2>
        <p className="text-muted-foreground">{t('register.thanksBody', { email: done })}</p>
        <p className="text-muted-foreground">{t('register.thanksNext')}</p>
      </output>
    );
  }

  const hasShifts = event.teams.length > 0;

  return (
    <form onSubmit={(e) => void onSubmit(e)} noValidate className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl">{t('register.title')}</h2>
        <p className="text-muted-foreground">{t('register.subtitle')}</p>
      </div>

      <FieldGroup className="gap-4">
        <Field data-invalid={!!errors.name}>
          <FieldLabel htmlFor="name">{t('register.name')}</FieldLabel>
          <Input
            id="name"
            autoComplete="name"
            aria-invalid={!!errors.name}
            {...form.register('name')}
          />
          <FormFieldError error={errors.name} />
        </Field>
        <Field data-invalid={!!errors.email}>
          <FieldLabel htmlFor="email">{t('register.email')}</FieldLabel>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            aria-invalid={!!errors.email}
            {...form.register('email')}
          />
          <FieldDescription>{t('register.emailHelp')}</FieldDescription>
          <FormFieldError error={errors.email} />
        </Field>
        <Field data-invalid={!!errors.phone}>
          <FieldLabel htmlFor="phone">{t('register.phone')}</FieldLabel>
          <Input
            id="phone"
            type="tel"
            autoComplete="tel"
            placeholder={t('register.optional')}
            {...form.register('phone')}
          />
          <FormFieldError error={errors.phone} />
        </Field>
      </FieldGroup>

      <FieldSet className="gap-3">
        <FieldLegend className="mb-0 text-lg">{t('register.availabilityTitle')}</FieldLegend>
        <FieldDescription>
          {wholeEventOnly
            ? t('register.askWholeEvent')
            : t('register.askShifts', { count: event.requiredShifts })}
        </FieldDescription>

        <label
          className={cn(
            'flex min-h-12 items-center gap-3 rounded-2xl border-2 border-input px-4 py-3 font-bold has-checked:border-primary has-checked:bg-brand-tint',
            errors.wholeEvent && 'border-destructive',
          )}
        >
          <input
            type="checkbox"
            className="size-5 accent-primary"
            {...form.register('wholeEvent')}
          />
          {t('register.wholeEvent')}
        </label>
        <FormFieldError error={errors.wholeEvent} />

        {!wholeEvent && !wholeEventOnly && hasShifts && (
          <Controller
            control={form.control}
            name="availableShiftIds"
            render={({ field }) => (
              <div className="flex flex-col gap-4">
                {event.teams.map((team) => (
                  <div key={team.id} className="flex flex-col gap-2">
                    <div>
                      <h3 className="text-base">{team.name}</h3>
                      {team.description && (
                        <p className="text-sm text-muted-foreground">{team.description}</p>
                      )}
                    </div>
                    {team.shifts.map((shift) => {
                      const checked = field.value.includes(shift.id);
                      return (
                        <label
                          key={shift.id}
                          className="flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl border-2 border-input px-4 py-2.5 has-checked:border-primary has-checked:bg-brand-tint"
                        >
                          <input
                            type="checkbox"
                            className="size-5 shrink-0 accent-primary"
                            checked={checked}
                            onChange={() =>
                              field.onChange(
                                checked
                                  ? field.value.filter((id) => id !== shift.id)
                                  : [...field.value, shift.id],
                              )
                            }
                          />
                          <span className="flex flex-col">
                            <span className="font-bold">
                              {formatShortDay(shiftDay(shift))} ·{' '}
                              {formatShiftTime(shift.startsAt, shift.endsAt)}
                            </span>
                            {shift.meetingPoint && (
                              <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                                <MapPin className="size-3.5" aria-hidden />
                                {shift.meetingPoint}
                              </span>
                            )}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                ))}
                <p className="text-sm text-muted-foreground" aria-live="polite">
                  {t('register.pickedCount', {
                    count: picked.length,
                    required: event.requiredShifts,
                  })}
                </p>
              </div>
            )}
          />
        )}
        <FormFieldError error={errors.availableShiftIds as never} />
      </FieldSet>

      {hasShifts && (
        <FieldSet className="gap-3">
          <FieldLegend className="mb-0 text-lg">{t('register.preferredTeamTitle')}</FieldLegend>
          <FieldDescription>{t('register.preferredTeamHelp')}</FieldDescription>
          <div className="flex flex-wrap gap-2">
            {[{ id: '', name: t('register.noPreference') }, ...event.teams].map((team) => (
              <label
                key={team.id || 'none'}
                className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border-2 border-input px-4 text-sm font-bold has-checked:border-primary has-checked:bg-brand-tint"
              >
                <input
                  type="radio"
                  value={team.id}
                  className="sr-only"
                  {...form.register('preferredTeamId')}
                />
                {team.id && <Star className="size-4" aria-hidden />}
                {team.name}
              </label>
            ))}
          </div>
        </FieldSet>
      )}

      <Field data-invalid={!!errors.notes}>
        <FieldLabel htmlFor="notes">{t('register.notes')}</FieldLabel>
        <Textarea
          id="notes"
          rows={3}
          placeholder={t('register.notesPlaceholder')}
          {...form.register('notes')}
        />
        <FormFieldError error={errors.notes} />
      </Field>

      {/* Hidden from people (and screen readers); bots fill it in. */}
      <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="website">Website</label>
        <input id="website" tabIndex={-1} autoComplete="off" {...form.register('website')} />
      </div>

      <div className="flex flex-col gap-1">
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 size-5 shrink-0 accent-primary"
            {...form.register('consent')}
          />
          <span>{t('register.consent', { organization: event.organizationName })}</span>
        </label>
        <FormFieldError error={errors.consent} />
      </div>

      <FormError message={formError} />
      <Button type="submit" variant="accent" size="lg" disabled={isPending} className="w-full">
        {t('register.submit')}
      </Button>
    </form>
  );
}
