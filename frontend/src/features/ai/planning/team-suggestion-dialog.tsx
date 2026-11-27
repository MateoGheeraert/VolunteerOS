'use client';

import { Check } from 'lucide-react';
import { useAction } from 'next-safe-action/hooks';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { MILA_NAME, MilaBadge } from '@/components/mila';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { nextDay } from '@/features/planning/schemas';
import { useActionFeedback } from '@/features/tasks/tasks-context';
import { brusselsToUtcIso, utcIsoToBrussels } from '@/lib/format';
import { acceptTeamSuggestions } from '@/server/ai/planning-actions';
import type { TeamSuggestion } from './schemas';

interface ShiftRow {
  keep: boolean;
  date: string;
  start: string;
  end: string;
  capacity: string;
}

const toRows = (suggestion: TeamSuggestion): ShiftRow[] =>
  suggestion.payload.shifts.map((shift) => {
    const start = utcIsoToBrussels(shift.startsAt);
    return {
      keep: true,
      date: start.date,
      start: start.time,
      end: utcIsoToBrussels(shift.endsAt).time,
      capacity: String(shift.capacity),
    };
  });

/** A row as the API takes it, or null when it isn't valid. An end before the start is the next day. */
function toShift(row: ShiftRow) {
  const capacity = Number(row.capacity);
  if (!row.date || !row.start || !row.end || row.start === row.end) return null;
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 500) return null;
  const endDate = row.end <= row.start ? nextDay(row.date) : row.date;
  return {
    startsAt: brusselsToUtcIso(row.date, row.start),
    endsAt: brusselsToUtcIso(endDate, row.end),
    capacity,
  };
}

/**
 * "Bewerken" on Mila's team card: change the team, edit or untick its shifts, then create it with
 * the shifts kept, in one go. The backend checks the shifts fall within the event.
 */
export function TeamSuggestionDialog({
  eventId,
  suggestion,
  onClose,
}: {
  eventId: string;
  suggestion: TeamSuggestion | null;
  onClose: () => void;
}) {
  const t = useTranslations('milaPlanning.teamDialog');
  return (
    <Dialog open={suggestion !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="lg">
        <DialogHeader>
          <MilaBadge label={t('badge', { name: MILA_NAME })} className="self-start" />
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        {suggestion && (
          <TeamForm
            key={suggestion.id}
            eventId={eventId}
            suggestion={suggestion}
            onDone={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function TeamForm({
  eventId,
  suggestion,
  onDone,
}: {
  eventId: string;
  suggestion: TeamSuggestion;
  onDone: () => void;
}) {
  const t = useTranslations('milaPlanning.teamDialog');
  const feedback = useActionFeedback();
  const [name, setName] = useState(suggestion.payload.name);
  const [description, setDescription] = useState(suggestion.payload.description ?? '');
  const [meetingPoint, setMeetingPoint] = useState(suggestion.payload.defaultMeetingPoint ?? '');
  const [rows, setRows] = useState(() => toRows(suggestion));
  const save = useAction(acceptTeamSuggestions.bind(null, eventId), {
    onSuccess: () => {
      feedback.onSuccess();
      onDone();
    },
    onError: feedback.onError,
  });
  const update = (index: number, patch: Partial<ShiftRow>) =>
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const kept = rows.filter((row) => row.keep);
  const shifts = kept.map(toShift);
  const valid = name.trim().length > 0 && shifts.every((shift) => shift !== null);

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid) return;
        save.execute({
          items: [
            {
              suggestionId: suggestion.id,
              team: { name, description, defaultMeetingPoint: meetingPoint },
              shifts: shifts.filter((shift) => shift !== null),
            },
          ],
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-bold">
          {t('name')}
          <Input value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-bold">
          {t('meetingPoint')}
          <Input
            value={meetingPoint}
            maxLength={200}
            onChange={(e) => setMeetingPoint(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-bold sm:col-span-2">
          {t('teamDescription')}
          <Textarea
            value={description}
            maxLength={2000}
            rows={2}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-bold">{t('shifts')}</legend>
        <div className="hidden grid-cols-[2rem_1fr_7rem_7rem_6rem] gap-2 px-1 text-xs font-bold text-muted-foreground sm:grid">
          <span />
          <span>{t('date')}</span>
          <span>{t('start')}</span>
          <span>{t('end')}</span>
          <span>{t('capacity')}</span>
        </div>
        {rows.map((row, index) => (
          <div
            key={index}
            className="grid grid-cols-[2rem_1fr] items-center gap-2 rounded-card bg-muted/50 p-2 sm:grid-cols-[2rem_1fr_7rem_7rem_6rem]"
          >
            <input
              type="checkbox"
              className="size-4 accent-mila"
              checked={row.keep}
              aria-label={t('keepShift')}
              onChange={(e) => update(index, { keep: e.target.checked })}
            />
            <Input
              type="date"
              aria-label={t('date')}
              value={row.date}
              disabled={!row.keep}
              onChange={(e) => update(index, { date: e.target.value })}
            />
            <Input
              type="time"
              aria-label={t('start')}
              value={row.start}
              disabled={!row.keep}
              onChange={(e) => update(index, { start: e.target.value })}
              className="col-start-2 sm:col-start-auto"
            />
            <Input
              type="time"
              aria-label={t('end')}
              value={row.end}
              disabled={!row.keep}
              onChange={(e) => update(index, { end: e.target.value })}
              className="col-start-2 sm:col-start-auto"
            />
            <Input
              type="number"
              min={1}
              max={500}
              aria-label={t('capacity')}
              value={row.capacity}
              disabled={!row.keep}
              onChange={(e) => update(index, { capacity: e.target.value })}
              className="col-start-2 sm:col-start-auto"
            />
          </div>
        ))}
        {kept.length === 0 && <p className="text-xs text-muted-foreground">{t('noShifts')}</p>}
      </fieldset>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          {t('cancel')}
        </Button>
        <Button type="submit" variant="mila" disabled={!valid || save.isPending}>
          <Check aria-hidden />
          {t('create', { count: kept.length })}
        </Button>
      </div>
    </form>
  );
}
