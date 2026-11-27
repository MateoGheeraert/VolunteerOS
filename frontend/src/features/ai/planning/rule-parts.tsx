'use client';

import { useTranslations } from 'next-intl';
import type { RulePersonPick } from '@/api/generated/types.gen';
import { NativeSelect } from '@/components/ui/native-select';
import { cn } from '@/lib/utils';
import { SOFT_RULES, type RuleKind } from './schemas';

/** What a rule says, after the person's name: "niet vóór 18:00", "liefst samen met Jan". */
export function useRuleText() {
  const t = useTranslations('milaPlanning.rule');
  return (rule: {
    kind: RuleKind;
    teamName?: string | null;
    maxShifts?: number | null;
    time?: string | null;
    otherName?: string | null;
  }) =>
    t(rule.kind, {
      team: rule.teamName ?? '',
      other: rule.otherName ?? '?',
      count: rule.maxShifts ?? 0,
      time: rule.time ?? '',
    });
}

/** A rule's kind: a must (hard) or a wish (soft). */
export function RuleStrength({ kind }: { kind: RuleKind }) {
  const t = useTranslations('milaPlanning.rules');
  const soft = SOFT_RULES.includes(kind);
  return (
    <span
      className={cn(
        'rounded-full px-2 text-xs font-bold',
        soft ? 'bg-muted text-muted-foreground' : 'bg-brand-tint text-primary',
      )}
    >
      {soft ? t('soft') : t('hard')}
    </span>
  );
}

/**
 * The person a rule is about: their name when Mila is sure, else a choice between the people the
 * name fits ("Welke Jan?").
 */
export function PersonPick({
  pick,
  value,
  onChange,
  disabled,
}: {
  pick: RulePersonPick;
  value: string | null;
  onChange: (volunteerId: string) => void;
  disabled?: boolean;
}) {
  const t = useTranslations('milaPlanning.rules');
  if (pick.volunteerId)
    return <span className="font-bold">{pick.candidates[0]?.name ?? pick.name}</span>;
  return (
    <span className="inline-block w-48">
      <NativeSelect
        aria-label={t('whichOne', { name: pick.name })}
        value={value ?? ''}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className={cn('h-8 font-bold', !value && 'border-mila text-mila')}
      >
        <option value="" disabled>
          {t('whichOne', { name: pick.name })}
        </option>
        {pick.candidates.map((candidate) => (
          <option key={candidate.volunteerId} value={candidate.volunteerId}>
            {candidate.name}
          </option>
        ))}
      </NativeSelect>
    </span>
  );
}

/** "Altijd" (the person, every event) or "Enkel dit evenement". */
export function ScopeSelect({
  value,
  onChange,
  disabled,
  className = 'w-48',
}: {
  value: 'organization' | 'event';
  onChange: (scope: 'organization' | 'event') => void;
  disabled?: boolean;
  /** The width; compact next to a rule, full in a form. */
  className?: string;
}) {
  const t = useTranslations('milaPlanning.rules');
  return (
    <span className={cn('inline-block', className)}>
      <NativeSelect
        aria-label={t('scopeLabel')}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as 'organization' | 'event')}
        className="h-8 text-xs"
      >
        <option value="organization">{t('scope.organization')}</option>
        <option value="event">{t('scope.event')}</option>
      </NativeSelect>
    </span>
  );
}
