'use client';

import { Copy, Trash2 } from 'lucide-react';
import { useAction } from 'next-safe-action/hooks';
import { useTranslations } from 'next-intl';
import { useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import type { Shift, Team } from '@/api/generated/types.gen';
import { FormError, FormFieldError } from '@/components/form-error';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { useActionForm } from '@/hooks/use-action-form';
import { formatDateTime, formatShortDay, utcIsoToBrussels } from '@/lib/format';
import { createShift, deleteShift, updateShift } from '@/server/planning/actions';
import { cn } from '@/lib/utils';
import { useConfirm } from './confirm-dialog';
import { shiftFormSchemaFor, type shiftFormSchema, type ShiftFormValues } from './schemas';

/** Every Brussels day from the start to the end of the window: the days a shift may start on. */
function windowDays(window: { startsAt: string; endsAt: string }): string[] {
  const first = utcIsoToBrussels(window.startsAt).date;
  const last = utcIsoToBrussels(window.endsAt).date;
  const days: string[] = [];
  for (let day = first; day <= last && days.length < 60;) {
    days.push(day);
    const [y, m, d] = day.split('-').map(Number);
    day = new Date(Date.UTC(y!, m! - 1, d! + 1)).toISOString().slice(0, 10);
  }
  return days;
}

/**
 * Creates a shift (no `shift`) or edits one. "Duplicate" opens a new form with the same values,
 * so the next slot of the same team is one time change away.
 */
export function ShiftForm({
  eventId,
  teams,
  window,
  shift,
  defaultValues,
  onDone,
  onDuplicate,
}: {
  eventId: string;
  teams: Team[];
  window: { startsAt: string; endsAt: string };
  shift?: Shift;
  defaultValues: ShiftFormValues;
  onDone: () => void;
  onDuplicate?: (values: ShiftFormValues) => void;
}) {
  const t = useTranslations();
  const [confirmDialog, confirm] = useConfirm();
  const { form, onSubmit, formError, pending } = useActionForm<
    typeof shiftFormSchema,
    { id: string } | void
  >(
    shift ? updateShift.bind(null, eventId, shift.id) : createShift.bind(null, eventId),
    shiftFormSchemaFor(window),
    {
      defaultValues,
      onSuccess: () => {
        toast.success(shift ? t('planning.saved') : t('planning.shifts.created'));
        onDone();
      },
    },
  );
  const remove = useAction(deleteShift.bind(null, eventId, shift?.id ?? ''), {
    onSuccess: () => {
      toast.success(t('planning.shifts.deleted'));
      onDone();
    },
    onError: ({ error }) => toast.error(t(error.serverError?.message ?? 'common.genericError')),
  });
  const { errors } = form.formState;
  const days = windowDays(window);
  const teamId = useWatch({ control: form.control, name: 'teamId' });
  const team = teams.find((x) => x.id === teamId);

  const onDelete = async () => {
    if (!shift) return;
    // Removing a shift with confirmed people needs a confirmation (acceptance criterion).
    if (shift.confirmedCount > 0 || shift.assignedCount > 0) {
      const ok = await confirm({
        title: t('planning.shifts.deleteTitle'),
        body: (
          <>
            <span>{t('planning.shifts.deleteBody', { count: shift.assignedCount })}</span>
            {shift.confirmedCount > 0 && (
              <strong className="text-status-bad">
                {t('planning.confirmedWarning', { count: shift.confirmedCount })}
              </strong>
            )}
          </>
        ),
        confirmLabel: t('planning.shifts.deleteConfirm'),
        destructive: true,
      });
      if (!ok) return;
    }
    remove.execute({ confirmed: true });
  };

  return (
    <form onSubmit={(event) => void onSubmit(event)} noValidate className="flex flex-col gap-5">
      {confirmDialog}
      <FieldGroup className="gap-4">
        <Field data-invalid={!!errors.teamId}>
          <FieldLabel htmlFor="shift-team">{t('planning.shifts.team')}</FieldLabel>
          <NativeSelect id="shift-team" aria-invalid={!!errors.teamId} {...form.register('teamId')}>
            {teams.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </NativeSelect>
          <FormFieldError error={errors.teamId} />
        </Field>

        <Field data-invalid={!!errors.date}>
          <FieldLabel htmlFor="shift-date">{t('planning.shifts.day')}</FieldLabel>
          <NativeSelect id="shift-date" aria-invalid={!!errors.date} {...form.register('date')}>
            {days.map((day) => (
              <option key={day} value={day}>
                {formatShortDay(day)}
              </option>
            ))}
          </NativeSelect>
          <FormFieldError error={errors.date} />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field data-invalid={!!errors.startTime}>
            <FieldLabel htmlFor="shift-start">{t('planning.shifts.start')}</FieldLabel>
            <Input
              id="shift-start"
              type="time"
              step={300}
              aria-invalid={!!errors.startTime}
              {...form.register('startTime')}
            />
            <FormFieldError error={errors.startTime} />
          </Field>
          <Field data-invalid={!!errors.endTime}>
            <FieldLabel htmlFor="shift-end">{t('planning.shifts.end')}</FieldLabel>
            <Input
              id="shift-end"
              type="time"
              step={300}
              aria-invalid={!!errors.endTime}
              {...form.register('endTime')}
            />
            <FormFieldError error={errors.endTime} />
          </Field>
        </div>
        <FieldDescription className="-mt-2">
          {t('planning.shifts.windowHelp', {
            from: formatDateTime(window.startsAt),
            until: formatDateTime(window.endsAt),
          })}
        </FieldDescription>

        <Field data-invalid={!!errors.capacity} className="max-w-40">
          <FieldLabel htmlFor="shift-capacity">{t('planning.shifts.capacity')}</FieldLabel>
          <Input
            id="shift-capacity"
            inputMode="numeric"
            autoComplete="off"
            aria-invalid={!!errors.capacity}
            {...form.register('capacity')}
          />
          <FormFieldError error={errors.capacity} />
        </Field>

        <Field data-invalid={!!errors.meetingPoint}>
          <FieldLabel htmlFor="shift-meeting-point">{t('planning.shifts.meetingPoint')}</FieldLabel>
          <Input
            id="shift-meeting-point"
            placeholder={team?.defaultMeetingPoint ?? t('planning.teams.meetingPointPlaceholder')}
            {...form.register('meetingPoint')}
          />
          {!shift && team?.defaultMeetingPoint && (
            <FieldDescription>{t('planning.shifts.meetingPointDefault')}</FieldDescription>
          )}
          <FormFieldError error={errors.meetingPoint} />
        </Field>
      </FieldGroup>

      {shift && shift.assignedCount > 0 && (
        <p className="rounded-xl bg-status-warn-bg px-3.5 py-2.5 text-sm font-semibold text-status-warn">
          {t('planning.shifts.editWarning')}
        </p>
      )}
      <FormError message={formError} />

      {/* Like every edit modal: save on the left, the shift's other actions on the right. */}
      <div
        className={cn('flex flex-wrap items-center gap-2', shift && 'border-t border-border pt-5')}
      >
        <Button type="submit" disabled={pending}>
          {shift ? t('common.save') : t('planning.shifts.create')}
        </Button>
        {shift && (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {onDuplicate && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => onDuplicate(form.getValues())}
              >
                <Copy data-icon="inline-start" aria-hidden />
                {t('planning.shifts.duplicate')}
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              className="text-destructive"
              onClick={() => void onDelete()}
              disabled={remove.isPending}
            >
              <Trash2 data-icon="inline-start" aria-hidden />
              {t('planning.shifts.delete')}
            </Button>
          </div>
        )}
      </div>
    </form>
  );
}
