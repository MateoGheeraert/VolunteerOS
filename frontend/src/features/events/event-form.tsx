'use client';

import { CalendarDays } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { nlBE } from 'react-day-picker/locale';
import { Controller } from 'react-hook-form';
import { toast } from 'sonner';
import { FormError, FormFieldError } from '@/components/form-error';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { useActionForm } from '@/hooks/use-action-form';
import { cn } from '@/lib/utils';
import { createEvent, updateEvent } from '@/server/events/actions';
import { eventFormSchema, type EventFormValues } from './schemas';

const EMPTY: EventFormValues = {
  name: '',
  description: '',
  location: '',
  date: '',
  startTime: '',
  endTime: '',
};

const dateLabel = new Intl.DateTimeFormat('nl-BE', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/** "2026-12-19" ↔ a Date at local midnight, only for the calendar widget. */
const toPickerDate = (value: string) => {
  const [y, m, d] = value.split('-').map(Number);
  return value ? new Date(y!, m! - 1, d!) : undefined;
};
const fromPickerDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/** Creates an event, or edits one when `eventId` is set. */
export function EventForm({
  eventId,
  defaultValues,
  readOnly = false,
}: {
  eventId?: string;
  defaultValues?: EventFormValues;
  readOnly?: boolean;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [dateOpen, setDateOpen] = useState(false);

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

          <div className="grid gap-5 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
            <Field data-invalid={!!errors.date}>
              <FieldLabel htmlFor="date">{t('eventForm.date')}</FieldLabel>
              <Controller
                control={form.control}
                name="date"
                render={({ field }) => (
                  <Popover open={dateOpen} onOpenChange={setDateOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        id="date"
                        type="button"
                        variant="outline"
                        disabled={readOnly}
                        aria-invalid={!!errors.date}
                        className={cn(
                          'h-11 justify-start rounded-xl border-2 border-input bg-background px-3.5 font-semibold',
                          !field.value && 'text-muted-foreground',
                        )}
                      >
                        <CalendarDays aria-hidden />
                        {field.value
                          ? dateLabel.format(toPickerDate(field.value))
                          : t('eventForm.pickDate')}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-2" align="start">
                      <Calendar
                        mode="single"
                        locale={nlBE}
                        selected={toPickerDate(field.value)}
                        defaultMonth={toPickerDate(field.value)}
                        onSelect={(date) => {
                          if (date) field.onChange(fromPickerDate(date));
                          setDateOpen(false);
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                )}
              />
              <FormFieldError error={errors.date} />
            </Field>
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
