'use client';

import { CalendarDays } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { nlBE } from 'react-day-picker/locale';
import { Controller, useWatch, type FieldError } from 'react-hook-form';
import { toast } from 'sonner';
import { FormError, FormFieldError } from '@/components/form-error';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { useActionForm } from '@/hooks/use-action-form';
import { LOCALE, TIME_ZONE } from '@/lib/format';
import { cn } from '@/lib/utils';
import { createEvent, updateEvent } from '@/server/events/actions';
import {
  EVENT_TYPES,
  eventFormSchema,
  formStartIso,
  type EditionOption,
  type EventFormValues,
  type EventType,
} from './schemas';

const EMPTY: Partial<EventFormValues> = {
  name: '',
  // No type preselected: the organizer has to choose one. '' selects the placeholder option and
  // fails validation until they do.
  eventType: '' as EventType,
  description: '',
  location: '',
  date: '',
  startTime: '',
  endDate: '',
  endTime: '',
  previousEditionId: '',
  expectedAttendance: '',
  actualAttendance: '',
  retrospective: '',
};

const dateLabel = new Intl.DateTimeFormat(LOCALE, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const editionDate = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

/** "2026-12-19" ↔ a Date at local midnight, only for the calendar widget. */
const toPickerDate = (value: string) => {
  const [y, m, d] = value.split('-').map(Number);
  return value ? new Date(y!, m! - 1, d!) : undefined;
};
const fromPickerDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/**
 * Creates an event, or edits one when `eventId` is set. `editions` are the events it may continue
 * (see editionOptions); the form only offers those that start before this event.
 */
export function EventForm({
  eventId,
  defaultValues,
  editions,
  readOnly = false,
}: {
  eventId?: string;
  defaultValues?: EventFormValues;
  editions: EditionOption[];
  readOnly?: boolean;
}) {
  const t = useTranslations();
  const router = useRouter();

  // Create returns the new id; update returns nothing.
  const { form, onSubmit, formError, pending } = useActionForm<
    typeof eventFormSchema,
    { id: string } | void
  >(eventId ? updateEvent.bind(null, eventId) : createEvent, eventFormSchema, {
    defaultValues: defaultValues ?? EMPTY,
    onSuccess: (data, values) => {
      if (data?.id) {
        toast.success(t('events.created'));
        router.push(`/events/${data.id}`);
      } else {
        toast.success(t('events.updated'));
        form.reset(values);
        router.refresh();
      }
    },
  });
  const { errors } = form.formState;

  const [date, startTime, previousEditionId] = useWatch({
    control: form.control,
    name: ['date', 'startTime', 'previousEditionId'],
  });
  const startIso = formStartIso({ date: date ?? '', startTime: startTime ?? '' });
  // Only earlier events can be continued. The current choice always stays listed, so changing
  // the date never silently drops it; the backend rejects it if it no longer fits.
  const offered = editions.filter(
    (edition) => edition.id === previousEditionId || !startIso || edition.startsAt < startIso,
  );
  const savedPrevious = defaultValues?.previousEditionId;
  // A linked edition the user can't see (or that was deleted) still needs an option, otherwise
  // the select would fall back to "none" and saving would remove the link.
  const unlistedPrevious =
    savedPrevious && !editions.some((edition) => edition.id === savedPrevious)
      ? savedPrevious
      : null;

  /** A new start date pulls the end date along while it was the same day (or is now earlier). */
  const onStartDateChange = (previous: string, next: string) => {
    const endDate = form.getValues('endDate');
    if (!endDate || endDate === previous || endDate < next) {
      form.setValue('endDate', next, {
        shouldDirty: true,
        shouldValidate: form.formState.isSubmitted,
      });
    }
  };

  return (
    <form onSubmit={(event) => void onSubmit(event)} noValidate className="flex flex-col gap-6">
      {/* A native disabled fieldset (not useForm's `disabled`, which drops the default values). */}
      <fieldset disabled={readOnly} className="contents">
        <FieldGroup className="gap-5">
          <Field data-invalid={!!errors.name}>
            <FieldLabel htmlFor="name">{t('eventForm.name')}</FieldLabel>
            <Input
              id="name"
              placeholder={t('eventForm.namePlaceholder')}
              aria-invalid={!!errors.name}
              {...form.register('name')}
            />
            <FormFieldError error={errors.name} />
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field data-invalid={!!errors.eventType}>
              <FieldLabel htmlFor="eventType">{t('eventForm.eventType')}</FieldLabel>
              <NativeSelect
                id="eventType"
                aria-invalid={!!errors.eventType}
                {...form.register('eventType')}
              >
                <option value="">{t('eventForm.pickEventType')}</option>
                {EVENT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {t(`eventType.${type}`)}
                  </option>
                ))}
              </NativeSelect>
              <FormFieldError error={errors.eventType} />
            </Field>
            <Field data-invalid={!!errors.expectedAttendance}>
              <FieldLabel htmlFor="expectedAttendance">
                {t('eventForm.expectedAttendance')}
              </FieldLabel>
              <Input
                id="expectedAttendance"
                inputMode="numeric"
                autoComplete="off"
                placeholder={t('eventForm.attendancePlaceholder')}
                aria-invalid={!!errors.expectedAttendance}
                {...form.register('expectedAttendance')}
              />
              <FormFieldError error={errors.expectedAttendance} />
            </Field>
          </div>

          <div className="grid gap-5 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <Controller
              control={form.control}
              name="date"
              render={({ field }) => (
                <DateField
                  id="date"
                  label={t('eventForm.date')}
                  placeholder={t('eventForm.pickDate')}
                  value={field.value}
                  onChange={(next) => {
                    onStartDateChange(field.value, next);
                    field.onChange(next);
                  }}
                  error={errors.date}
                  disabled={readOnly}
                />
              )}
            />
            <Field data-invalid={!!errors.startTime}>
              <FieldLabel htmlFor="startTime">{t('eventForm.startTime')}</FieldLabel>
              <Input
                id="startTime"
                type="time"
                step={300}
                aria-invalid={!!errors.startTime}
                {...form.register('startTime')}
              />
              <FormFieldError error={errors.startTime} />
            </Field>
            <Controller
              control={form.control}
              name="endDate"
              render={({ field }) => (
                <DateField
                  id="endDate"
                  label={t('eventForm.endDate')}
                  placeholder={t('eventForm.pickDate')}
                  value={field.value}
                  onChange={field.onChange}
                  error={errors.endDate}
                  disabled={readOnly}
                  fromDate={date}
                />
              )}
            />
            <Field data-invalid={!!errors.endTime}>
              <FieldLabel htmlFor="endTime">{t('eventForm.endTime')}</FieldLabel>
              <Input
                id="endTime"
                type="time"
                step={300}
                aria-invalid={!!errors.endTime}
                {...form.register('endTime')}
              />
              <FormFieldError error={errors.endTime} />
            </Field>
          </div>
          <FieldDescription className="-mt-2">{t('eventForm.endsNextDay')}</FieldDescription>

          <Field data-invalid={!!errors.location}>
            <FieldLabel htmlFor="location">{t('eventForm.location')}</FieldLabel>
            <Input
              id="location"
              placeholder={t('eventForm.locationPlaceholder')}
              aria-invalid={!!errors.location}
              {...form.register('location')}
            />
            <FormFieldError error={errors.location} />
          </Field>

          <Field data-invalid={!!errors.previousEditionId}>
            <FieldLabel htmlFor="previousEditionId">{t('eventForm.previousEdition')}</FieldLabel>
            <NativeSelect
              id="previousEditionId"
              aria-invalid={!!errors.previousEditionId}
              {...form.register('previousEditionId')}
            >
              <option value="">{t('eventForm.previousEditionNone')}</option>
              {unlistedPrevious && (
                <option value={unlistedPrevious}>{t('eventForm.previousEditionHidden')}</option>
              )}
              {offered.map((edition) => (
                <option key={edition.id} value={edition.id}>
                  {edition.name} · {editionDate.format(new Date(edition.startsAt))}
                </option>
              ))}
            </NativeSelect>
            <FieldDescription>{t('eventForm.previousEditionHelp')}</FieldDescription>
            <FormFieldError error={errors.previousEditionId} />
          </Field>

          <Field data-invalid={!!errors.description}>
            <FieldLabel htmlFor="description">{t('eventForm.description')}</FieldLabel>
            <Textarea
              id="description"
              rows={4}
              placeholder={t('eventForm.descriptionPlaceholder')}
              aria-invalid={!!errors.description}
              {...form.register('description')}
            />
            <FormFieldError error={errors.description} />
          </Field>

          {eventId && (
            <FieldSet className="gap-5 border-t-2 border-border pt-6">
              <div className="flex flex-col gap-1">
                <FieldLegend className="mb-0 text-lg">{t('eventForm.afterTitle')}</FieldLegend>
                <FieldDescription>{t('eventForm.afterBody')}</FieldDescription>
              </div>
              <Field data-invalid={!!errors.actualAttendance} className="sm:max-w-xs">
                <FieldLabel htmlFor="actualAttendance">
                  {t('eventForm.actualAttendance')}
                </FieldLabel>
                <Input
                  id="actualAttendance"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder={t('eventForm.attendancePlaceholder')}
                  aria-invalid={!!errors.actualAttendance}
                  {...form.register('actualAttendance')}
                />
                <FormFieldError error={errors.actualAttendance} />
              </Field>
              <Field data-invalid={!!errors.retrospective}>
                <FieldLabel htmlFor="retrospective">{t('eventForm.retrospective')}</FieldLabel>
                <Textarea
                  id="retrospective"
                  rows={4}
                  placeholder={t('eventForm.retrospectivePlaceholder')}
                  aria-invalid={!!errors.retrospective}
                  {...form.register('retrospective')}
                />
                <FormFieldError error={errors.retrospective} />
              </Field>
            </FieldSet>
          )}
        </FieldGroup>
      </fieldset>

      <FormError message={formError} />

      {!readOnly && (
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          {!eventId && (
            <Button type="button" variant="ghost" onClick={() => router.back()}>
              {t('common.cancel')}
            </Button>
          )}
          <Button
            type="submit"
            size="lg"
            disabled={pending || (!!eventId && !form.formState.isDirty)}
          >
            {eventId ? t('eventForm.saveButton') : t('eventForm.createButton')}
          </Button>
        </div>
      )}
    </form>
  );
}

/** A date as a button that opens a calendar. `fromDate` greys out the days before it. */
function DateField({
  id,
  label,
  placeholder,
  value,
  onChange,
  error,
  disabled,
  fromDate,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  error?: FieldError;
  disabled: boolean;
  fromDate?: string;
}) {
  const [open, setOpen] = useState(false);
  const earliest = fromDate ? toPickerDate(fromDate) : undefined;
  return (
    <Field data-invalid={!!error}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            aria-invalid={!!error}
            className={cn(
              'h-11 justify-start rounded-xl border-2 border-input bg-background px-3.5 font-semibold',
              !value && 'text-muted-foreground',
            )}
          >
            <CalendarDays aria-hidden />
            <span className="truncate">
              {value ? dateLabel.format(toPickerDate(value)) : placeholder}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2" align="start">
          <Calendar
            mode="single"
            locale={nlBE}
            selected={toPickerDate(value)}
            defaultMonth={toPickerDate(value) ?? earliest}
            disabled={earliest ? { before: earliest } : undefined}
            onSelect={(date) => {
              if (date) onChange(fromPickerDate(date));
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
      <FormFieldError error={error} />
    </Field>
  );
}
