'use client';

import { ListChecks, Plus, Send, Shuffle, Sparkles } from 'lucide-react';
import { useAction } from 'next-safe-action/hooks';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import type {
  AiEventState,
  Event,
  Planning,
  PlanningRule,
  RuleDraftResult,
} from '@/api/generated/types.gen';
import { MILA_NAME, MilaAvatar, MilaBar } from '@/components/mila';
import { Badge } from '@/components/ui/badge';
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
import { PlanningBoard, type BoardMilaSlots } from '@/features/planning/planning-board';
import { shiftDay } from '@/features/planning/planning-rules';
import { useActionFeedback } from '@/features/tasks/tasks-context';
import { markSuggestionsSeen } from '@/server/ai/actions';
import {
  acceptTeamSuggestions,
  draftRules,
  requestAllocation,
  requestShiftSuggestions,
} from '@/server/ai/planning-actions';
import { useAiLive } from '../use-ai-live';
import { AllocationBanner, useProposal } from './allocation';
import {
  capacityFor,
  extraShiftsFor,
  SUGGESTION_ATTRIBUTE,
  SuggestedCapacity,
  SuggestedExtraShift,
  SuggestedTeamLane,
} from './board-suggestions';
import { RuleDraftDialog } from './rule-draft-dialog';
import { RulesDialog } from './rules-dialog';
import {
  teamAsIs,
  type AllocationSuggestion,
  type RuleSuggestion,
  type ShiftChangeSuggestion,
  type TeamSuggestion,
} from './schemas';
import { TeamSuggestionDialog } from './team-suggestion-dialog';

/**
 * The planning page with Mila (docs/info.md §7.7.1): her line above the board, her proposal's
 * explanation, and the board with her proposals in it: new teams as dashed lanes, extra shifts
 * as dashed cards, other capacities on the shift, and her draft chips. For the people who manage
 * the event while Mila is available; everyone else gets the board alone.
 */
export function PlanningWithMila({
  event,
  planning,
  state,
  rules,
  canManage,
  readOnly,
}: {
  event: Event;
  planning: Planning;
  state: AiEventState;
  rules: PlanningRule[];
  canManage: boolean;
  readOnly: boolean;
}) {
  useAiLive(event.id, state.enabled);
  const allocation =
    state.suggestions.find((s): s is AllocationSuggestion => s.kind === 'allocation') ?? null;
  const proposal = useProposal(event.id, allocation);
  const [editing, setEditing] = useState<TeamSuggestion | null>(null);

  const teams = state.suggestions.filter((s): s is TeamSuggestion => s.kind === 'team_suggestion');
  const changes = state.suggestions.filter(
    (s): s is ShiftChangeSuggestion => s.kind === 'shift_change',
  );
  const noteRules = state.suggestions.filter(
    (s): s is RuleSuggestion => s.kind === 'planning_rule',
  );
  useMarkSeen(event.id, [...teams, ...changes]);

  // The overview's "Bekijk voorstellen" links here with ?mila=voorstellen: scroll to the first.
  const showSuggestions = useSearchParams().get('mila') === 'voorstellen';
  useEffect(() => {
    if (!showSuggestions) return;
    document
      .querySelector(`[${SUGGESTION_ATTRIBUTE}]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [showSuggestions]);
  // Only rules from notes waiting: they live in the Regels dialog, so open that.
  const openRulesFirst =
    showSuggestions &&
    noteRules.length > 0 &&
    teams.length === 0 &&
    changes.length === 0 &&
    !allocation;

  const slots: BoardMilaSlots | null = state.enabled
    ? {
        days: [
          ...teams.flatMap((suggestion) =>
            suggestion.payload.shifts.map((shift) => shift.startsAt),
          ),
          ...changes.map((change) => change.payload.startsAt),
        ].map((startsAt) => shiftDay({ startsAt })),
        lanes: (day) =>
          teams.length > 0
            ? teams.map((suggestion) => (
                <SuggestedTeamLane
                  key={suggestion.id}
                  eventId={event.id}
                  suggestion={suggestion}
                  day={day}
                  readOnly={readOnly}
                  onEdit={() => setEditing(suggestion)}
                />
              ))
            : null,
        extraShifts: (teamId, day) =>
          extraShiftsFor(changes, teamId, day, (suggestion) => (
            <SuggestedExtraShift
              key={`${suggestion.id}:${suggestion.payload.capacity}`}
              eventId={event.id}
              suggestion={suggestion}
              readOnly={readOnly}
            />
          )),
        onShift: (shiftId) =>
          capacityFor(changes, shiftId, (suggestion) => (
            <SuggestedCapacity
              key={suggestion.id}
              eventId={event.id}
              suggestion={suggestion}
              readOnly={readOnly}
            />
          )),
      }
    : null;

  return (
    <>
      <PlanningMilaBar
        event={event}
        planning={planning}
        state={state}
        rules={rules}
        teams={teams}
        changes={changes}
        noteRules={noteRules}
        openRulesFirst={openRulesFirst}
        readOnly={readOnly}
      />
      {allocation && proposal && (
        <div {...{ [SUGGESTION_ATTRIBUTE]: '' }}>
          <AllocationBanner
            eventId={event.id}
            suggestion={allocation}
            proposal={proposal}
            planning={planning}
            readOnly={readOnly}
          />
        </div>
      )}
      <PlanningBoard
        event={event}
        planning={planning}
        canManage={canManage}
        readOnly={readOnly}
        proposal={proposal}
        mila={slots}
      />
      <TeamSuggestionDialog
        eventId={event.id}
        suggestion={editing}
        onClose={() => setEditing(null)}
      />
    </>
  );
}

/** Pilot metric "shown": reports proposals the first time they are on screen. */
function useMarkSeen(eventId: string, suggestions: { id: string; seenAt: string | null }[]) {
  const markSeen = useAction(markSuggestionsSeen.bind(null, eventId));
  const unseen = suggestions
    .filter((s) => s.seenAt === null)
    .map((s) => s.id)
    .join(',');
  useEffect(() => {
    if (unseen) markSeen.execute({ suggestionIds: unseen.split(',') });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per new set of proposals
  }, [unseen]);
}

function PlanningMilaBar({
  event,
  planning,
  state,
  rules,
  teams,
  changes,
  noteRules,
  openRulesFirst,
  readOnly,
}: {
  event: Event;
  planning: Planning;
  state: AiEventState;
  rules: PlanningRule[];
  teams: TeamSuggestion[];
  changes: ShiftChangeSuggestion[];
  noteRules: RuleSuggestion[];
  /** "Bekijk voorstellen" when only rules from notes wait: open the Regels dialog at once. */
  openRulesFirst: boolean;
  readOnly: boolean;
}) {
  const t = useTranslations('milaPlanning');
  const feedback = useActionFeedback();
  const eventId = event.id;
  const [askOpen, setAskOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(openRulesFirst);
  const [text, setText] = useState('');
  const [draftOpen, setDraftOpen] = useState(false);
  const [draft, setDraft] = useState<RuleDraftResult | null>(null);

  const runOf = (feature: 'shift_suggestions' | 'allocation') =>
    state.runs.find((run) => run.feature === feature);
  const busy = (feature: 'shift_suggestions' | 'allocation') => {
    const status = runOf(feature)?.status;
    return status === 'queued' || status === 'running';
  };
  const suggesting = busy('shift_suggestions');
  const allocating = busy('allocation');
  const failed =
    runOf('shift_suggestions')?.status === 'failed' || runOf('allocation')?.status === 'failed';

  const allocate = useAction(requestAllocation.bind(null, eventId), feedback);
  const addAll = useAction(acceptTeamSuggestions.bind(null, eventId), feedback);
  const read = useAction(draftRules.bind(null, eventId), {
    onExecute: () => {
      setDraft(null);
      setDraftOpen(true);
    },
    onSuccess: ({ data }) => {
      if (data) setDraft(data);
      setText('');
    },
    onError: (args) => {
      setDraftOpen(false);
      feedback.onError(args);
    },
  });

  const count = teams.length + changes.length;
  const openPlaces = planning.shifts.reduce(
    (sum, shift) => sum + Math.max(0, shift.capacity - shift.assignedCount),
    0,
  );

  if (!state.enabled) return null;

  const message = suggesting
    ? t('bar.suggesting', { name: MILA_NAME })
    : allocating
      ? t('bar.allocating', { name: MILA_NAME })
      : count > 0
        ? t('bar.suggestions', { name: MILA_NAME, count })
        : planning.teams.length === 0
          ? t('bar.empty', { name: MILA_NAME })
          : t('bar.idle', { name: MILA_NAME });
  const thinking = suggesting || allocating;
  const detail =
    !thinking && failed
      ? t('bar.failed')
      : count > 0
        ? t('bar.suggestionsDetail')
        : t('bar.detail');

  return (
    <>
      <MilaBar
        thinking={thinking}
        message={message}
        detail={detail}
        actions={
          !readOnly && (
            <>
              {teams.length > 1 && (
                <Button
                  size="sm"
                  variant="mila"
                  disabled={addAll.isPending}
                  onClick={() => addAll.execute({ items: teams.map(teamAsIs) })}
                >
                  <Plus aria-hidden />
                  {t('bar.addAll', { count: teams.length })}
                </Button>
              )}
              <Button
                size="sm"
                variant={planning.teams.length === 0 && count === 0 ? 'mila' : 'mila-soft'}
                disabled={suggesting}
                onClick={() => setAskOpen(true)}
              >
                <Sparkles aria-hidden />
                {t('bar.suggestShifts')}
              </Button>
              {planning.shifts.length > 0 && (
                <Button
                  size="sm"
                  variant="mila-soft"
                  disabled={allocating || allocate.isPending || openPlaces === 0}
                  title={openPlaces === 0 ? t('bar.nothingOpen') : undefined}
                  onClick={() => allocate.execute()}
                >
                  <Shuffle aria-hidden />
                  {t('bar.allocate')}
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => setRulesOpen(true)}>
                <ListChecks aria-hidden />
                {t('bar.rules', { count: rules.length })}
                {noteRules.length > 0 && (
                  <Badge variant="new">{t('bar.rulesNew', { count: noteRules.length })}</Badge>
                )}
              </Button>
            </>
          )
        }
      >
        {!readOnly && planning.applications.length > 0 && (
          <form
            className="flex w-full gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (text.trim()) read.execute({ text });
            }}
          >
            <Input
              value={text}
              maxLength={2000}
              onChange={(e) => setText(e.target.value)}
              placeholder={t('bar.tellPlaceholder')}
              aria-label={t('bar.tellPlaceholder')}
              disabled={read.isPending}
              className="h-9 bg-card"
            />
            <Button
              type="submit"
              size="icon"
              variant="mila"
              disabled={read.isPending || !text.trim()}
              aria-label={t('bar.tellSend')}
            >
              <Send aria-hidden />
            </Button>
          </form>
        )}
      </MilaBar>

      <AskShiftsDialog eventId={eventId} open={askOpen} onOpenChange={setAskOpen} pending={count} />
      <RulesDialog
        eventId={eventId}
        open={rulesOpen}
        onOpenChange={setRulesOpen}
        rules={rules}
        noteRules={noteRules}
        planning={planning}
        readOnly={readOnly}
      />
      <RuleDraftDialog
        eventId={eventId}
        open={draftOpen}
        onOpenChange={setDraftOpen}
        reading={read.isPending}
        result={draft}
      />
    </>
  );
}

/**
 * "Stel teams en shiften voor": say what you need ("twee shiften afwas, twee aan de bar"), or
 * leave it empty and Mila proposes from the previous edition and the rules of thumb.
 */
function AskShiftsDialog({
  eventId,
  open,
  onOpenChange,
  pending,
}: {
  eventId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Proposals still open: a new request replaces them. */
  pending: number;
}) {
  const t = useTranslations('milaPlanning.ask');
  const feedback = useActionFeedback();
  const [instruction, setInstruction] = useState('');
  const request = useAction(requestShiftSuggestions.bind(null, eventId), {
    ...feedback,
    onSuccess: () => {
      setInstruction('');
      onOpenChange(false);
      feedback.onSuccess();
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader className="flex-row items-center gap-3">
          <MilaAvatar />
          <div className="flex flex-col gap-1">
            <DialogTitle className="text-mila-ink">{t('title', { name: MILA_NAME })}</DialogTitle>
            <DialogDescription>{t('description')}</DialogDescription>
          </div>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            request.execute({ instruction });
          }}
        >
          <div className="flex flex-col gap-2">
            <label htmlFor="shift-instruction" className="text-sm font-bold">
              {t('label')}
            </label>
            <Textarea
              id="shift-instruction"
              rows={3}
              maxLength={500}
              value={instruction}
              placeholder={t('placeholder')}
              onChange={(e) => setInstruction(e.target.value)}
              disabled={request.isPending}
            />
            <p className="text-xs text-muted-foreground">{t('help')}</p>
          </div>
          {pending > 0 && <p className="text-xs text-muted-foreground">{t('replaces')}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" variant="mila" disabled={request.isPending}>
              <Sparkles aria-hidden />
              {instruction.trim() ? t('submitAsked') : t('submitFree')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
