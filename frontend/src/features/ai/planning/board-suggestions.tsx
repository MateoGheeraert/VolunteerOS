'use client';

import { Check, PencilLine, Plus, X } from 'lucide-react';
import { useAction } from 'next-safe-action/hooks';
import { useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import { MILA_NAME, MilaBadge } from '@/components/mila';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { shiftDay } from '@/features/planning/planning-rules';
import { useActionFeedback } from '@/features/tasks/tasks-context';
import { formatShiftTime, formatShortDay } from '@/lib/format';
import { rejectSuggestion } from '@/server/ai/actions';
import { acceptShiftChange, acceptTeamSuggestions } from '@/server/ai/planning-actions';
import { Citations } from '../suggestion-cards';
import { teamAsIs, type ShiftChangeSuggestion, type TeamSuggestion } from './schemas';

/**
 * Mila's team and shift proposals in the schedule itself (docs/info.md §7.7.1 A): a new team is a
 * dashed lane below the real ones, an extra shift a dashed card in its team, another capacity a
 * line on the shift it changes. Dashed and lavender means "proposed"; solid means "planned".
 */

/** Marks proposals, so "Bekijk voorstellen" (?mila=voorstellen) can scroll to the first one. */
export const SUGGESTION_ATTRIBUTE = 'data-mila-suggestion';

const shownOn = (startsAt: string, day: string) => day === 'all' || shiftDay({ startsAt }) === day;

function useReject(eventId: string, suggestionId: string) {
  const feedback = useActionFeedback();
  return useAction(rejectSuggestion.bind(null, eventId, suggestionId), feedback);
}

/** A proposed shift: the dashed twin of a shift card. */
function GhostShift({
  startsAt,
  endsAt,
  capacity,
  requested,
  children,
}: {
  startsAt: string;
  endsAt: string;
  capacity: ReactNode;
  /** The times asked for, when they ran past the event and the shift was cut to its hours. */
  requested?: { startsAt: string; endsAt: string } | null;
  children?: ReactNode;
}) {
  const t = useTranslations('milaPlanning.cards');
  return (
    <article className="flex flex-col gap-2.5 rounded-card border-2 border-dashed border-mila-tint-strong bg-mila-tint/40 p-3">
      <div className="flex items-start justify-between gap-2">
        <span className="font-extrabold text-mila-ink">
          {formatShortDay(shiftDay({ startsAt }))} · {formatShiftTime(startsAt, endsAt)}
        </span>
        <span className="rounded-full bg-card px-2 py-0.5 text-sm font-bold whitespace-nowrap text-mila-ink">
          {capacity}
        </span>
      </div>
      {requested && (
        <p className="rounded-lg bg-status-warn-bg px-2 py-1 text-xs font-semibold text-status-warn">
          {t('trimmed', { time: formatShiftTime(requested.startsAt, requested.endsAt) })}
        </p>
      )}
      {children}
    </article>
  );
}

/** A new team Mila proposes, as a dashed lane with its shifts, below the teams you have. */
export function SuggestedTeamLane({
  eventId,
  suggestion,
  day,
  readOnly,
  onEdit,
}: {
  eventId: string;
  suggestion: TeamSuggestion;
  day: string;
  readOnly: boolean;
  onEdit: () => void;
}) {
  const t = useTranslations('milaPlanning.cards');
  const feedback = useActionFeedback();
  const add = useAction(acceptTeamSuggestions.bind(null, eventId), feedback);
  const reject = useReject(eventId, suggestion.id);
  const busy = readOnly || add.isPending || reject.isPending;
  const { payload } = suggestion;
  const shifts = payload.shifts.filter((shift) => shownOn(shift.startsAt, day));

  return (
    <section
      {...{ [SUGGESTION_ATTRIBUTE]: '' }}
      aria-label={t('suggestedTeam', { name: payload.name })}
      className="flex flex-col gap-3 rounded-card border-2 border-dashed border-mila-tint-strong bg-mila-tint/30 p-4"
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <MilaBadge label={t('suggestion', { name: MILA_NAME })} className="self-start" />
          <h2 className="text-base text-mila-ink">
            {t('newTeam', { name: payload.name, count: payload.shifts.length })}
          </h2>
          {payload.description && (
            <p className="text-sm text-muted-foreground">{payload.description}</p>
          )}
        </div>
        {!readOnly && (
          <div className="flex flex-wrap gap-1.5">
            <Button
              size="sm"
              variant="mila"
              disabled={busy}
              onClick={() => add.execute({ items: [teamAsIs(suggestion)] })}
            >
              <Plus aria-hidden />
              {t('add')}
            </Button>
            <Button size="sm" variant="mila-soft" disabled={busy} onClick={onEdit}>
              <PencilLine aria-hidden />
              {t('edit')}
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => reject.execute()}>
              <X aria-hidden />
              {t('notNeeded')}
            </Button>
          </div>
        )}
      </header>
      {shifts.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('noneThisDay')}</p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,16rem),1fr))] gap-3">
          {shifts.map((shift) => (
            <GhostShift
              key={shift.startsAt}
              startsAt={shift.startsAt}
              endsAt={shift.endsAt}
              capacity={t('people', { count: shift.capacity })}
              requested={shift.requested}
            />
          ))}
        </div>
      )}
      <p className="text-sm text-mila-ink">{suggestion.explanation}</p>
      <Citations citations={suggestion.citations} />
    </section>
  );
}

/** An extra shift Mila proposes for a team you have: a dashed card among its shifts. */
export function SuggestedExtraShift({
  eventId,
  suggestion,
  readOnly,
}: {
  eventId: string;
  suggestion: ShiftChangeSuggestion;
  readOnly: boolean;
}) {
  const t = useTranslations('milaPlanning.cards');
  const feedback = useActionFeedback();
  const { payload } = suggestion;
  const [capacity, setCapacity] = useState(String(payload.capacity));
  const accept = useAction(acceptShiftChange.bind(null, eventId, suggestion.id), feedback);
  const reject = useReject(eventId, suggestion.id);
  const busy = readOnly || accept.isPending || reject.isPending;
  const value = Number(capacity);
  const valid = Number.isInteger(value) && value >= 1 && value <= 500;

  return (
    <div {...{ [SUGGESTION_ATTRIBUTE]: '' }}>
      <GhostShift
        startsAt={payload.startsAt}
        endsAt={payload.endsAt}
        requested={payload.requested}
        capacity={
          readOnly ? (
            t('people', { count: payload.capacity })
          ) : (
            <label className="flex items-center gap-1">
              <Input
                type="number"
                min={1}
                max={500}
                value={capacity}
                disabled={busy}
                aria-label={t('capacity')}
                onChange={(event) => setCapacity(event.target.value)}
                className="h-6 w-14 px-1.5 text-sm"
              />
              {t('peopleShort')}
            </label>
          )
        }
      >
        <MilaBadge label={t('extraShift')} className="self-start" />
        <p className="text-sm text-mila-ink">{suggestion.explanation}</p>
        <Citations citations={suggestion.citations} />
        {!readOnly && (
          <div className="flex flex-wrap gap-1.5">
            <Button
              size="sm"
              variant="mila"
              disabled={busy || !valid}
              onClick={() => accept.execute({ capacity: value })}
            >
              <Plus aria-hidden />
              {t('add')}
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => reject.execute()}>
              <X aria-hidden />
              {t('notNeeded')}
            </Button>
          </div>
        )}
      </GhostShift>
    </div>
  );
}

/** Another capacity for a shift you have: a lavender line on that shift's card. */
export function SuggestedCapacity({
  eventId,
  suggestion,
  readOnly,
}: {
  eventId: string;
  suggestion: ShiftChangeSuggestion;
  readOnly: boolean;
}) {
  const t = useTranslations('milaPlanning.cards');
  const feedback = useActionFeedback();
  const { payload } = suggestion;
  const accept = useAction(acceptShiftChange.bind(null, eventId, suggestion.id), feedback);
  const reject = useReject(eventId, suggestion.id);
  const busy = readOnly || accept.isPending || reject.isPending;

  return (
    <div
      {...{ [SUGGESTION_ATTRIBUTE]: '' }}
      className="flex flex-col gap-2 rounded-xl border-2 border-dashed border-mila-tint-strong bg-mila-tint/40 p-2.5"
    >
      <p className="text-sm font-bold text-mila-ink">
        {t('capacityProposal', {
          name: MILA_NAME,
          from: payload.fromCapacity ?? 0,
          to: payload.capacity,
        })}
      </p>
      <p className="text-xs text-mila-ink/80">{suggestion.explanation}</p>
      {!readOnly && (
        <div className="flex flex-wrap gap-1.5">
          <Button
            size="xs"
            variant="mila"
            disabled={busy}
            onClick={() => accept.execute({ capacity: payload.capacity })}
          >
            <Check aria-hidden />
            {t('apply')}
          </Button>
          <Button size="xs" variant="ghost" disabled={busy} onClick={() => reject.execute()}>
            <X aria-hidden />
            {t('notNeeded')}
          </Button>
        </div>
      )}
    </div>
  );
}

/** The extra shifts proposed for one team on the visible day, or null when there are none. */
export function extraShiftsFor(
  changes: ShiftChangeSuggestion[],
  teamId: string,
  day: string,
  render: (suggestion: ShiftChangeSuggestion) => ReactNode,
): ReactNode {
  const extras = changes.filter(
    (change) =>
      change.payload.type === 'add_shift' &&
      change.payload.teamId === teamId &&
      shownOn(change.payload.startsAt, day),
  );
  return extras.length > 0 ? extras.map(render) : null;
}

/** The capacity proposals for one shift, or null. */
export function capacityFor(
  changes: ShiftChangeSuggestion[],
  shiftId: string,
  render: (suggestion: ShiftChangeSuggestion) => ReactNode,
): ReactNode {
  const found = changes.filter(
    (change) => change.payload.type === 'capacity' && change.payload.shiftId === shiftId,
  );
  return found.length > 0 ? found.map(render) : null;
}
