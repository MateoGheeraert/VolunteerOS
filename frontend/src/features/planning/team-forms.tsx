'use client';

import { Plus, Trash2, X } from 'lucide-react';
import { useAction } from 'next-safe-action/hooks';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { Team } from '@/api/generated/types.gen';
import { FormError, FormFieldError } from '@/components/form-error';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useActionForm } from '@/hooks/use-action-form';
import { createTeam, deleteTeam, updateTeam } from '@/server/planning/actions';
import { useConfirm } from './confirm-dialog';
import { TEAM_SUGGESTIONS, teamFormSchema } from './schemas';

/**
 * Adding a team once the event has some: a quiet link under the lanes that opens the quick add.
 * Most of the time every team exists already, so the form stays out of the way.
 */
export function AddTeam({ eventId, teams }: { eventId: string; teams: Team[] }) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  if (open) {
    return <TeamQuickAdd eventId={eventId} teams={teams} onClose={() => setOpen(false)} />;
  }
  return (
    <Button
      variant="ghost"
      size="sm"
      className="w-fit text-muted-foreground"
      onClick={() => setOpen(true)}
    >
      <Plus data-icon="inline-start" aria-hidden />
      {t('planning.teams.addAnother')}
    </Button>
  );
}

/**
 * Creating teams as fast as possible: type a name and press Enter, or click a suggestion.
 * Description and meeting point can be filled in later. `onClose`: shows a close button (the
 * collapsible version under existing teams).
 */
export function TeamQuickAdd({
  eventId,
  teams,
  onClose,
}: {
  eventId: string;
  teams: Team[];
  onClose?: () => void;
}) {
  const t = useTranslations();
  const { form, onSubmit, formError, pending } = useActionForm(
    createTeam.bind(null, eventId),
    teamFormSchema,
    {
      defaultValues: { name: '', description: '', defaultMeetingPoint: '' },
      onSuccess: () => form.reset({ name: '', description: '', defaultMeetingPoint: '' }),
    },
  );
  const quick = useAction(createTeam.bind(null, eventId), {
    onError: ({ error }) => toast.error(t(error.serverError?.message ?? 'common.genericError')),
  });
  // Opened on purpose from the "add another team" link: start typing right away.
  const collapsible = !!onClose;
  useEffect(() => {
    if (collapsible) form.setFocus('name');
  }, [collapsible, form]);
  const taken = new Set(teams.map((team) => team.name.toLocaleLowerCase('nl')));
  const suggestions = TEAM_SUGGESTIONS.filter((name) => !taken.has(name.toLocaleLowerCase('nl')));

  return (
    <div className="flex flex-col gap-3 rounded-3xl bg-card p-4 shadow-soft sm:p-5">
      {onClose && (
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base">{t('planning.teams.add')}</h2>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label={t('planning.teams.closeAdd')}
          >
            <X aria-hidden />
          </Button>
        </div>
      )}
      <form
        onSubmit={(event) => void onSubmit(event)}
        noValidate
        className="flex flex-col gap-2 sm:flex-row sm:items-start"
      >
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor="new-team" className="sr-only">
            {t('planning.teams.newName')}
          </label>
          <Input
            id="new-team"
            placeholder={t('planning.teams.newPlaceholder')}
            autoComplete="off"
            aria-invalid={!!form.formState.errors.name}
            {...form.register('name')}
          />
          <FormFieldError error={form.formState.errors.name} />
        </div>
        <Button type="submit" disabled={pending}>
          <Plus data-icon="inline-start" aria-hidden />
          {t('planning.teams.add')}
        </Button>
      </form>
      <FormError message={formError} />
      {suggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">{t('planning.teams.suggestions')}</span>
          {suggestions.map((name) => (
            <button
              key={name}
              type="button"
              disabled={quick.isPending}
              onClick={() => quick.execute({ name, description: '', defaultMeetingPoint: '' })}
              className="inline-flex h-8 items-center gap-1 rounded-full bg-brand-tint px-3 text-sm font-bold text-primary outline-none hover:bg-brand-tint-strong/40 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
            >
              <Plus className="size-3.5" aria-hidden />
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Edit a team's name, description and default meeting point, or delete it. */
export function TeamForm({
  eventId,
  team,
  shiftCount,
  confirmedCount,
  onDone,
}: {
  eventId: string;
  team: Team;
  shiftCount: number;
  confirmedCount: number;
  onDone: () => void;
}) {
  const t = useTranslations();
  const [confirmDialog, confirm] = useConfirm();
  const { form, onSubmit, formError, pending } = useActionForm(
    updateTeam.bind(null, eventId, team.id),
    teamFormSchema,
    {
      defaultValues: {
        name: team.name,
        description: team.description ?? '',
        defaultMeetingPoint: team.defaultMeetingPoint ?? '',
      },
      onSuccess: () => {
        toast.success(t('planning.saved'));
        onDone();
      },
    },
  );
  const remove = useAction(deleteTeam.bind(null, eventId, team.id), {
    onSuccess: () => {
      toast.success(t('planning.teams.deleted'));
      onDone();
    },
    onError: ({ error }) => toast.error(t(error.serverError?.message ?? 'common.genericError')),
  });
  const { errors } = form.formState;

  const onDelete = async () => {
    const ok = await confirm({
      title: t('planning.teams.deleteTitle', { name: team.name }),
      body: (
        <>
          <span>{t('planning.teams.deleteBody', { shifts: shiftCount })}</span>
          {confirmedCount > 0 && (
            <strong className="text-status-bad">
              {t('planning.confirmedWarning', { count: confirmedCount })}
            </strong>
          )}
        </>
      ),
      confirmLabel: t('planning.teams.deleteConfirm'),
      destructive: true,
    });
    if (ok) remove.execute({ confirmed: true });
  };

  return (
    <form onSubmit={(event) => void onSubmit(event)} noValidate className="flex flex-col gap-5">
      {confirmDialog}
      <FieldGroup className="gap-4">
        <Field data-invalid={!!errors.name}>
          <FieldLabel htmlFor="team-name">{t('planning.teams.name')}</FieldLabel>
          <Input id="team-name" aria-invalid={!!errors.name} {...form.register('name')} />
          <FormFieldError error={errors.name} />
        </Field>
        <Field data-invalid={!!errors.description}>
          <FieldLabel htmlFor="team-description">{t('planning.teams.description')}</FieldLabel>
          <Textarea
            id="team-description"
            rows={3}
            placeholder={t('planning.teams.descriptionPlaceholder')}
            {...form.register('description')}
          />
          <FieldDescription>{t('planning.teams.descriptionHelp')}</FieldDescription>
          <FormFieldError error={errors.description} />
        </Field>
        <Field data-invalid={!!errors.defaultMeetingPoint}>
          <FieldLabel htmlFor="team-meeting-point">{t('planning.teams.meetingPoint')}</FieldLabel>
          <Input
            id="team-meeting-point"
            placeholder={t('planning.teams.meetingPointPlaceholder')}
            {...form.register('defaultMeetingPoint')}
          />
          <FieldDescription>{t('planning.teams.meetingPointHelp')}</FieldDescription>
          <FormFieldError error={errors.defaultMeetingPoint} />
        </Field>
      </FieldGroup>
      <FormError message={formError} />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        <Button
          type="button"
          variant="destructive"
          onClick={() => void onDelete()}
          disabled={remove.isPending}
        >
          <Trash2 data-icon="inline-start" aria-hidden />
          {t('planning.teams.delete')}
        </Button>
        <Button type="submit" disabled={pending}>
          {t('common.save')}
        </Button>
      </div>
    </form>
  );
}
