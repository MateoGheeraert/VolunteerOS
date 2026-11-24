'use client';

import { Trash2 } from 'lucide-react';
import { useAction } from 'next-safe-action/hooks';
import { useTranslations } from 'next-intl';
import { Controller, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import type { Application, Shift, Team } from '@/api/generated/types.gen';
import { FormError, FormFieldError } from '@/components/form-error';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { useActionForm } from '@/hooks/use-action-form';
import { formatShiftTime, formatShortDay } from '@/lib/format';
import { createVolunteer, deleteVolunteer, updateVolunteer } from '@/server/planning/actions';
import { cn } from '@/lib/utils';
import { useConfirm } from './confirm-dialog';
import { shiftDay } from './planning-rules';
import { volunteerFormSchema, type VolunteerFormValues } from './schemas';

const EMPTY: VolunteerFormValues = {
  name: '',
  email: '',
  phone: '',
  notes: '',
  preferredTeamId: '',
  wholeEvent: false,
  availableShiftIds: [],
};

/**
 * Adds someone by hand (no `application`), or edits a volunteer's details and choices. Email is
 * optional here: not everyone the organizer calls uses it.
 */
export function VolunteerForm({
  eventId,
  teams,
  shifts,
  application,
  onDone,
}: {
  eventId: string;
  teams: Team[];
  shifts: Shift[];
  application?: Application;
  onDone: () => void;
}) {
  const t = useTranslations();
  const [confirmDialog, confirm] = useConfirm();
  const { form, onSubmit, formError, pending } = useActionForm(
    application
      ? updateVolunteer.bind(null, eventId, application.id)
      : createVolunteer.bind(null, eventId),
    volunteerFormSchema,
    {
      defaultValues: application
        ? {
            name: application.name,
            email: application.email ?? '',
            phone: application.phone ?? '',
            notes: application.notes ?? '',
            preferredTeamId: application.preferredTeamId ?? '',
            wholeEvent: application.wholeEvent,
            availableShiftIds: application.availableShiftIds,
          }
        : EMPTY,
      onSuccess: () => {
        toast.success(application ? t('planning.saved') : t('planning.volunteers.added'));
        onDone();
      },
    },
  );
  const remove = useAction(deleteVolunteer.bind(null, eventId, application?.id ?? ''), {
    onSuccess: () => {
      toast.success(t('planning.volunteers.removed'));
      onDone();
    },
    onError: ({ error }) => toast.error(t(error.serverError?.message ?? 'common.genericError')),
  });
  const { errors } = form.formState;
  const wholeEvent = useWatch({ control: form.control, name: 'wholeEvent' });

  const onDelete = async () => {
    if (!application) return;
    if (application.hasSentSchedule) {
      // They got their shifts by email: take them off and tell them first (backend enforces it).
      await confirm({
        title: t('planning.volunteers.removeTitle', { name: application.name }),
        body: <span>{t('planning.volunteers.tellFirst', { name: application.name })}</span>,
        confirmLabel: t('planning.volunteers.understood'),
      });
      return;
    }
    const confirmed = application.assignments.filter((a) => a.status === 'confirmed').length;
    const ok = await confirm({
      title: t('planning.volunteers.removeTitle', { name: application.name }),
      body: (
        <>
          <span>{t('planning.volunteers.removeBody')}</span>
          {confirmed > 0 && (
            <strong className="text-status-bad">
              {t('planning.confirmedWarning', { count: confirmed })}
            </strong>
          )}
        </>
      ),
      confirmLabel: t('planning.volunteers.removeConfirm'),
      destructive: true,
    });
    if (ok) remove.execute({ confirmed: true });
  };

  return (
    <form onSubmit={(event) => void onSubmit(event)} noValidate className="flex flex-col gap-5">
      {confirmDialog}
      {application && (
        <p className="text-sm text-muted-foreground">
          {application.source === 'public'
            ? t('planning.volunteers.viaLink')
            : t('planning.volunteers.byHand')}
        </p>
      )}
      <FieldGroup className="gap-4">
        <Field data-invalid={!!errors.name}>
          <FieldLabel htmlFor="volunteer-name">{t('planning.volunteers.name')}</FieldLabel>
          <Input id="volunteer-name" aria-invalid={!!errors.name} {...form.register('name')} />
          <FormFieldError error={errors.name} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={!!errors.email}>
            <FieldLabel htmlFor="volunteer-email">{t('planning.volunteers.email')}</FieldLabel>
            <Input
              id="volunteer-email"
              type="email"
              placeholder={t('planning.volunteers.optional')}
              aria-invalid={!!errors.email}
              {...form.register('email')}
            />
            <FormFieldError error={errors.email} />
          </Field>
          <Field data-invalid={!!errors.phone}>
            <FieldLabel htmlFor="volunteer-phone">{t('planning.volunteers.phone')}</FieldLabel>
            <Input
              id="volunteer-phone"
              type="tel"
              placeholder={t('planning.volunteers.optional')}
              {...form.register('phone')}
            />
            <FormFieldError error={errors.phone} />
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="volunteer-team">{t('planning.volunteers.preferredTeam')}</FieldLabel>
          <NativeSelect id="volunteer-team" {...form.register('preferredTeamId')}>
            <option value="">{t('planning.volunteers.noPreference')}</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </NativeSelect>
        </Field>

        <label className="flex items-center gap-3 rounded-xl bg-muted/60 px-3.5 py-3 text-sm font-bold">
          <input
            type="checkbox"
            className="size-5 accent-primary"
            {...form.register('wholeEvent')}
          />
          {t('planning.volunteers.wholeEvent')}
        </label>

        {!wholeEvent && shifts.length > 0 && (
          <FieldSet className="gap-3">
            <FieldLegend className="mb-0 text-sm">{t('planning.volunteers.available')}</FieldLegend>
            <Controller
              control={form.control}
              name="availableShiftIds"
              render={({ field }) => (
                <div className="flex flex-col gap-3">
                  {teams.map((team) => {
                    const own = shifts.filter((s) => s.teamId === team.id);
                    if (own.length === 0) return null;
                    return (
                      <div key={team.id} className="flex flex-col gap-1.5">
                        <span className="text-sm font-bold">{team.name}</span>
                        <div className="flex flex-wrap gap-1.5">
                          {own.map((shift) => {
                            const checked = field.value.includes(shift.id);
                            return (
                              <label
                                key={shift.id}
                                className="inline-flex cursor-pointer items-center gap-2 rounded-full border-2 border-input px-3 py-1.5 text-sm has-checked:border-primary has-checked:bg-brand-tint"
                              >
                                <input
                                  type="checkbox"
                                  className="size-4 accent-primary"
                                  checked={checked}
                                  onChange={() =>
                                    field.onChange(
                                      checked
                                        ? field.value.filter((x) => x !== shift.id)
                                        : [...field.value, shift.id],
                                    )
                                  }
                                />
                                {formatShortDay(shiftDay(shift))} ·{' '}
                                {formatShiftTime(shift.startsAt, shift.endsAt)}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            />
          </FieldSet>
        )}

        <Field data-invalid={!!errors.notes}>
          <FieldLabel htmlFor="volunteer-notes">{t('planning.volunteers.notes')}</FieldLabel>
          <Textarea id="volunteer-notes" rows={3} {...form.register('notes')} />
          <FormFieldError error={errors.notes} />
        </Field>
      </FieldGroup>
      <FormError message={formError} />
      {/* Like every edit modal: save on the left, removing on the right. */}
      <div
        className={cn(
          'flex flex-wrap items-center gap-2',
          application && 'border-t border-border pt-5',
        )}
      >
        <Button type="submit" disabled={pending}>
          {application ? t('common.save') : t('planning.volunteers.add')}
        </Button>
        {application && (
          <Button
            type="button"
            variant="ghost"
            className="ml-auto text-destructive"
            onClick={() => void onDelete()}
            disabled={remove.isPending}
          >
            <Trash2 data-icon="inline-start" aria-hidden />
            {t('planning.volunteers.remove')}
          </Button>
        )}
      </div>
    </form>
  );
}
