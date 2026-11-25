'use client';

import { Check } from 'lucide-react';
import { useAction } from 'next-safe-action/hooks';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { RuleDraft, RuleDraftResult } from '@/api/generated/types.gen';
import { MILA_NAME, MilaBadge, MilaBubble, MilaThinking } from '@/components/mila';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useActionFeedback } from '@/features/tasks/tasks-context';
import { createDraftRules } from '@/server/ai/planning-actions';
import { PersonPick, RuleStrength, ScopeSelect, useRuleText } from './rule-parts';
import { draftToRuleBody } from './schemas';

/** A chip as the organizer is setting it: kept or not, the person picked, the scope. */
interface Chip {
  draft: RuleDraft;
  keep: boolean;
  personId: string | null;
  otherId: string | null;
  scope: RuleDraft['scope'];
}

const toChips = (result: RuleDraftResult): Chip[] =>
  result.rules.map((draft) => ({
    draft,
    keep: true,
    personId: draft.person.volunteerId,
    otherId: draft.other?.volunteerId ?? null,
    scope: draft.scope,
  }));

/**
 * What Mila understood from "Vertel Mila iets over de planning", as rule chips to check: untick
 * what's wrong, pick the person where a name fits more than one, choose "altijd" or "enkel dit
 * evenement". Nothing is saved before "Bewaar".
 */
export function RuleDraftDialog({
  eventId,
  open,
  onOpenChange,
  reading,
  result,
}: {
  eventId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reading: boolean;
  result: RuleDraftResult | null;
}) {
  const t = useTranslations('milaPlanning.drafts');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <MilaBadge label={t('badge', { name: MILA_NAME })} className="self-start" />
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        {reading && <MilaThinking>{t('reading', { name: MILA_NAME })}</MilaThinking>}
        {result && (
          <ChipList
            key={result.runId}
            eventId={eventId}
            result={result}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ChipList({
  eventId,
  result,
  onDone,
}: {
  eventId: string;
  result: RuleDraftResult;
  onDone: () => void;
}) {
  const t = useTranslations('milaPlanning.drafts');
  const ruleText = useRuleText();
  const feedback = useActionFeedback();
  const [chips, setChips] = useState(() => toChips(result));
  const save = useAction(createDraftRules.bind(null, eventId, result.runId), {
    onSuccess: () => {
      feedback.onSuccess();
      onDone();
    },
    onError: feedback.onError,
  });
  const update = (index: number, patch: Partial<Chip>) =>
    setChips((current) => current.map((chip, i) => (i === index ? { ...chip, ...patch } : chip)));

  const kept = chips.filter((chip) => chip.keep);
  const bodies = kept.map((chip) => draftToRuleBody({ ...chip.draft, ...chip }));
  const complete = bodies.every((body) => body !== null);

  return (
    <div className="flex flex-col gap-4">
      {chips.length === 0 && result.unknownNames.length === 0 && (
        <MilaBubble message={t('nothing')} />
      )}
      {result.unknownNames.length > 0 && (
        <MilaBubble
          message={t('unknown', { names: result.unknownNames.join(', ') })}
          detail={t('unknownDetail')}
        />
      )}
      {chips.length > 0 && (
        <ul className="flex flex-col gap-2">
          {chips.map((chip, index) => {
            const otherName =
              chip.draft.other?.candidates.find((c) => c.volunteerId === chip.otherId)?.name ??
              chip.draft.other?.name;
            const id = `rule-chip-${index}`;
            return (
              <li
                key={id}
                className="flex flex-wrap items-center gap-2 rounded-card border border-mila-tint-strong/60 bg-mila-tint/60 px-3 py-2"
              >
                <input
                  id={id}
                  type="checkbox"
                  className="size-4 accent-mila"
                  checked={chip.keep}
                  onChange={(event) => update(index, { keep: event.target.checked })}
                  aria-label={t('keep')}
                />
                <PersonPick
                  pick={chip.draft.person}
                  value={chip.personId}
                  onChange={(personId) => update(index, { personId })}
                />
                <span className="text-sm">{ruleText({ ...chip.draft, otherName })}</span>
                {chip.draft.other && !chip.draft.other.volunteerId && (
                  <PersonPick
                    pick={chip.draft.other}
                    value={chip.otherId}
                    onChange={(otherId) => update(index, { otherId })}
                  />
                )}
                <RuleStrength kind={chip.draft.kind} />
                <span className="ml-auto">
                  <ScopeSelect value={chip.scope} onChange={(scope) => update(index, { scope })} />
                </span>
                <p className="w-full text-xs text-muted-foreground">“{chip.draft.quote}”</p>
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {!complete && <span className="text-xs font-bold text-mila">{t('pickFirst')}</span>}
        <Button
          variant="mila"
          disabled={kept.length === 0 || !complete || save.isPending}
          onClick={() => save.execute({ rules: bodies.filter((body) => body !== null) })}
        >
          <Check aria-hidden />
          {t('save', { count: kept.length })}
        </Button>
      </div>
    </div>
  );
}
