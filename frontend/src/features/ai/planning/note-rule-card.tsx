'use client';

import { Check, X } from 'lucide-react';
import { useAction } from 'next-safe-action/hooks';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { MilaSuggestion } from '@/components/mila';
import { Button } from '@/components/ui/button';
import { shiftDay } from '@/features/planning/planning-rules';
import { useActionFeedback } from '@/features/tasks/tasks-context';
import { formatShiftTime, formatShortDay } from '@/lib/format';
import { rejectSuggestion } from '@/server/ai/actions';
import { acceptRuleSuggestion } from '@/server/ai/planning-actions';
import { Citations } from '../suggestion-cards';
import { PersonPick, RuleStrength, ScopeSelect, useRuleText } from './rule-parts';
import { draftToRuleBody, type RuleSuggestion } from './schemas';

/** "za 19 dec · 17:00–22:00", in Brussels. */
export const slot = (startsAt: string, endsAt: string) =>
  `${formatShortDay(shiftDay({ startsAt }))} · ${formatShiftTime(startsAt, endsAt)}`;

function useReject(eventId: string, suggestionId: string) {
  const feedback = useActionFeedback();
  return useAction(rejectSuggestion.bind(null, eventId, suggestionId), feedback);
}

/** A rule Mila read in a volunteer's note: keep it (after picking who and for how long) or not. */
export function RuleCard({
  eventId,
  suggestion,
  disabled,
}: {
  eventId: string;
  suggestion: RuleSuggestion;
  disabled: boolean;
}) {
  const t = useTranslations('milaPlanning.cards');
  const ruleText = useRuleText();
  const feedback = useActionFeedback();
  const { payload } = suggestion;
  const [otherId, setOtherId] = useState(payload.other?.volunteerId ?? null);
  const [scope, setScope] = useState(payload.scope);
  const accept = useAction(acceptRuleSuggestion.bind(null, eventId, suggestion.id), feedback);
  const reject = useReject(eventId, suggestion.id);
  const busy = disabled || accept.isPending || reject.isPending;
  const body = draftToRuleBody({
    ...payload,
    scope,
    personId: payload.person.volunteerId,
    otherId,
  });
  const otherName =
    payload.other?.candidates.find((c) => c.volunteerId === otherId)?.name ?? payload.other?.name;

  return (
    <MilaSuggestion
      reason={t('fromNote', { name: payload.person.name, quote: payload.quote })}
      sources={<Citations citations={suggestion.citations} />}
      actions={
        <>
          <Button
            size="sm"
            variant="mila"
            disabled={busy || !body}
            onClick={() => body && accept.execute({ rule: body })}
          >
            <Check aria-hidden />
            {t('keepRule')}
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => reject.execute()}>
            <X aria-hidden />
            {t('ignoreRule')}
          </Button>
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-bold">{payload.person.name}</span>
        <span>{ruleText({ ...payload, otherName })}</span>
        {payload.other && !payload.other.volunteerId && (
          <PersonPick pick={payload.other} value={otherId} onChange={setOtherId} disabled={busy} />
        )}
        <RuleStrength kind={payload.kind} />
        <span className="ml-auto">
          <ScopeSelect value={scope} onChange={setScope} disabled={busy} />
        </span>
      </div>
    </MilaSuggestion>
  );
}
