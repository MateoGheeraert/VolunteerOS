'use client';

import { Check, CheckCheck, X } from 'lucide-react';
import { useAction } from 'next-safe-action/hooks';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import type { AllocationPlacement, Planning } from '@/api/generated/types.gen';
import { MilaAvatar, MilaBubble } from '@/components/mila';
import { Button } from '@/components/ui/button';
import { useActionFeedback } from '@/features/tasks/tasks-context';
import { cn } from '@/lib/utils';
import { rejectSuggestion } from '@/server/ai/actions';
import { acceptPlacements, discardPlacements } from '@/server/ai/planning-actions';
import { slot } from './note-rule-card';
import type { AllocationSuggestion, PlacementRef } from './schemas';

/** Mila's open allocation, and what the board can do with its draft chips. */
export interface Proposal {
  placements: AllocationPlacement[];
  busy: boolean;
  accept: (placements: PlacementRef[]) => void;
  discard: (placements: PlacementRef[]) => void;
}

const ref = ({ applicationId, shiftId }: PlacementRef) => ({ applicationId, shiftId });

/**
 * Takes over or drops placements of Mila's proposal: all, a shift's, a person's or one. Accepted
 * ones become proposed assignments; nobody is told anything until the schedule is published.
 */
export function useProposal(
  eventId: string,
  suggestion: AllocationSuggestion | null,
): Proposal | null {
  const t = useTranslations('milaPlanning.allocation');
  const feedback = useActionFeedback();
  const id = suggestion?.id ?? '';
  const accept = useAction(acceptPlacements.bind(null, eventId, id), {
    onSuccess: ({ data }) => {
      if (data) {
        toast.success(
          data.skipped > 0
            ? t('acceptedSkipped', { placed: data.placed, skipped: data.skipped })
            : t('accepted', { count: data.placed }),
        );
      }
      feedback.onSuccess();
    },
    onError: feedback.onError,
  });
  const discard = useAction(discardPlacements.bind(null, eventId, id), feedback);
  if (!suggestion) return null;
  return {
    placements: suggestion.payload.placements,
    busy: accept.isPending || discard.isPending,
    accept: (placements) => accept.execute({ placements: placements.map(ref) }),
    discard: (placements) => discard.execute({ placements: placements.map(ref) }),
  };
}

/**
 * A volunteer Mila proposes for a shift, on the board next to the real ones: dashed, in her
 * colors, until the organizer takes it over (✓) or drops it (✗).
 */
export function MilaDraftChip({
  name,
  placement,
  proposal,
  editable,
}: {
  name: string;
  placement: AllocationPlacement;
  proposal: Proposal;
  editable: boolean;
}) {
  const t = useTranslations('milaPlanning.allocation');
  const why = placement.reasons.map((reason) => t(`reasons.${reason}`)).join(' · ');
  return (
    <span
      className="inline-flex items-center gap-0.5 rounded-full border-2 border-dashed border-mila/60 bg-mila-tint py-0.5 pr-0.5 pl-1 text-sm font-bold text-mila-ink"
      title={why ? `${t('draftTitle')}: ${why}` : t('draftTitle')}
    >
      <MilaAvatar size="xs" />
      <span className="px-1">{name}</span>
      <span className="sr-only">{t('draftTitle')}</span>
      {editable && (
        <>
          <button
            type="button"
            disabled={proposal.busy}
            onClick={() => proposal.accept([placement])}
            aria-label={t('acceptOne', { name })}
            className="grid size-6 place-items-center rounded-full text-status-ok hover:bg-status-ok-bg"
          >
            <Check className="size-3.5" aria-hidden />
          </button>
          <button
            type="button"
            disabled={proposal.busy}
            onClick={() => proposal.discard([placement])}
            aria-label={t('discardOne', { name })}
            className="grid size-6 place-items-center rounded-full text-mila-ink/60 hover:bg-card"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </>
      )}
    </span>
  );
}

/** "Neem 2 over" on a shift card: the shift's draft chips at once. */
export function AcceptShiftDrafts({
  placements,
  proposal,
}: {
  placements: AllocationPlacement[];
  proposal: Proposal;
}) {
  const t = useTranslations('milaPlanning.allocation');
  if (placements.length < 2) return null;
  return (
    <Button
      size="xs"
      variant="mila-soft"
      className="self-start"
      disabled={proposal.busy}
      onClick={() => proposal.accept(placements)}
    >
      <CheckCheck data-icon="inline-start" aria-hidden />
      {t('acceptShift', { count: placements.length })}
    </Button>
  );
}

/**
 * Mila explains her proposal above the board: what she filled, and every place left open with
 * the solver's reason ("Kassa laat: 1 plaats tekort, niemand anders is beschikbaar"), and who she
 * could not place. "Neem alles over" or "Verwerp".
 */
export function AllocationBanner({
  eventId,
  suggestion,
  proposal,
  planning,
  readOnly,
}: {
  eventId: string;
  suggestion: AllocationSuggestion;
  proposal: Proposal;
  planning: Planning;
  readOnly: boolean;
}) {
  const t = useTranslations('milaPlanning.allocation');
  const feedback = useActionFeedback();
  const reject = useAction(rejectSuggestion.bind(null, eventId, suggestion.id), feedback);
  const { payload } = suggestion;
  const shiftById = new Map(planning.shifts.map((s) => [s.id, s]));
  const teamName = new Map(planning.teams.map((team) => [team.id, team.name]));
  const nameOf = new Map(planning.applications.map((a) => [a.id, a.name]));
  const open = payload.placements.length;
  const busy = proposal.busy || reject.isPending;

  return (
    <MilaBubble
      message={open > 0 ? t('title', { count: open }) : t('titleNone')}
      detail={suggestion.explanation}
    >
      {payload.accepted > 0 && (
        <p className="text-sm text-muted-foreground">
          {t('alreadyTaken', { count: payload.accepted })}
        </p>
      )}
      {payload.gaps.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-sm font-bold">{t('gapsTitle')}</p>
          <ul className="flex flex-col gap-0.5 text-sm">
            {payload.gaps.map((gap) => {
              const shift = shiftById.get(gap.shiftId);
              if (!shift) return null;
              return (
                <li key={gap.shiftId}>
                  <span className="font-bold">
                    {teamName.get(shift.teamId)} · {slot(shift.startsAt, shift.endsAt)}
                  </span>
                  : {t('gap', { count: gap.missing })}, {t(`gapReasons.${gap.reason}`)}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {payload.unplaced.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-sm font-bold">{t('unplacedTitle')}</p>
          <ul className="flex flex-col gap-0.5 text-sm">
            {payload.unplaced.map((person) => (
              <li key={person.applicationId}>
                <span className="font-bold">{nameOf.get(person.applicationId)}</span>:{' '}
                {t(`unplacedReasons.${person.reason}`)}
              </li>
            ))}
          </ul>
        </div>
      )}
      {payload.rulesFromNotes > 0 && (
        <p className="text-xs text-muted-foreground">
          {t('fromNotes', { count: payload.rulesFromNotes })}
        </p>
      )}
      {!readOnly && (
        <div className={cn('flex flex-wrap gap-2')}>
          {open > 0 && (
            <Button
              size="sm"
              variant="mila"
              disabled={busy}
              onClick={() => proposal.accept(payload.placements)}
            >
              <CheckCheck aria-hidden />
              {t('acceptAll', { count: open })}
            </Button>
          )}
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => reject.execute()}>
            <X aria-hidden />
            {open > 0 ? t('reject') : t('close')}
          </Button>
        </div>
      )}
      {open > 0 && <p className="text-xs text-muted-foreground">{t('nobodyTold')}</p>}
    </MilaBubble>
  );
}
