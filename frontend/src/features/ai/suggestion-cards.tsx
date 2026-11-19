'use client';

import { Check, PencilLine, Send, X } from 'lucide-react';
import { useAction } from 'next-safe-action/hooks';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { AiCitation } from '@/api/generated/types.gen';
import { MilaBubble, MilaSuggestion } from '@/components/mila';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PriorityBadge } from '@/features/tasks/task-badges';
import { useActionFeedback } from '@/features/tasks/tasks-context';
import { formatDay } from '@/lib/format';
import { acceptEventUpdate, answerQuestion, rejectSuggestion } from '@/server/ai/actions';
import type { EventUpdateSuggestion, QuestionSuggestion, TaskSuggestion } from './schemas';

/** "Gebaseerd op: Tent huren (taak), Kerstmarkt 2025": every suggestion says where it comes from. */
export function Citations({ citations }: { citations: AiCitation[] }) {
  const t = useTranslations();
  if (citations.length === 0) return null;
  return (
    <p className="text-xs text-muted-foreground">
      <span className="font-bold text-mila-ink/80">{t('ai.basedOn')} </span>
      {citations
        .map((citation) => `${citation.label} (${t(`ai.citationType.${citation.type}`)})`)
        .join(', ')}
    </p>
  );
}

function useReject(eventId: string, suggestionId: string) {
  const feedback = useActionFeedback();
  return useAction(rejectSuggestion.bind(null, eventId, suggestionId), feedback);
}

export function TaskSuggestionCard({
  eventId,
  suggestion,
  selected,
  onSelectedChange,
  onEdit,
  disabled,
}: {
  eventId: string;
  suggestion: TaskSuggestion;
  selected: boolean;
  onSelectedChange: (selected: boolean) => void;
  onEdit: () => void;
  disabled: boolean;
}) {
  const t = useTranslations();
  const reject = useReject(eventId, suggestion.id);
  const { payload } = suggestion;
  const checkboxId = `suggestion-${suggestion.id}`;

  return (
    <MilaSuggestion
      reason={suggestion.explanation}
      sources={<Citations citations={suggestion.citations} />}
      actions={
        <>
          <Button size="sm" variant="mila-soft" onClick={onEdit} disabled={disabled}>
            <PencilLine aria-hidden />
            {t('ai.editAndAdd')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => reject.execute()}
            disabled={disabled || reject.isPending}
          >
            <X aria-hidden />
            {t('ai.notNeeded')}
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-3">
        <input
          id={checkboxId}
          type="checkbox"
          className="mt-1 size-4 accent-mila"
          checked={selected}
          disabled={disabled}
          onChange={(event) => onSelectedChange(event.target.checked)}
        />
        <label htmlFor={checkboxId} className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="font-bold">{payload.title}</span>
          {payload.description && (
            <span className="text-sm whitespace-pre-line text-muted-foreground">
              {payload.description}
            </span>
          )}
          <span className="flex flex-wrap items-center gap-2 text-sm">
            <PriorityBadge priority={payload.priority} />
            {payload.dueDate && (
              <span className="text-muted-foreground">
                {t('ai.dueBy', { date: formatDay(payload.dueDate) })}
              </span>
            )}
          </span>
        </label>
      </div>
    </MilaSuggestion>
  );
}

export function QuestionCard({
  eventId,
  suggestion,
  disabled,
}: {
  eventId: string;
  suggestion: QuestionSuggestion;
  disabled: boolean;
}) {
  const t = useTranslations();
  const feedback = useActionFeedback();
  const answer = useAction(answerQuestion.bind(null, eventId, suggestion.id), feedback);
  const reject = useReject(eventId, suggestion.id);
  const [text, setText] = useState('');
  const busy = disabled || answer.isPending || reject.isPending;

  return (
    <MilaBubble asListItem message={suggestion.title} detail={suggestion.explanation}>
      {suggestion.payload.options.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {suggestion.payload.options.map((option) => (
            <Button
              key={option}
              size="sm"
              variant="mila-soft"
              disabled={busy}
              onClick={() => answer.execute({ text: option })}
            >
              {option}
            </Button>
          ))}
        </div>
      )}
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (text.trim()) answer.execute({ text });
        }}
      >
        <Input
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={t('ai.answerPlaceholder')}
          aria-label={t('ai.answerPlaceholder')}
          maxLength={1000}
          disabled={busy}
        />
        <Button
          type="submit"
          size="icon"
          variant="mila"
          disabled={busy || !text.trim()}
          aria-label={t('ai.send')}
        >
          <Send aria-hidden />
        </Button>
      </form>
      <Button
        size="sm"
        variant="ghost"
        className="self-start"
        disabled={busy}
        onClick={() => reject.execute()}
      >
        {t('ai.skip')}
      </Button>
    </MilaBubble>
  );
}

export function EventUpdateCard({
  eventId,
  suggestion,
  disabled,
}: {
  eventId: string;
  suggestion: EventUpdateSuggestion;
  disabled: boolean;
}) {
  const t = useTranslations();
  const feedback = useActionFeedback();
  const accept = useAction(acceptEventUpdate.bind(null, eventId, suggestion.id), feedback);
  const reject = useReject(eventId, suggestion.id);
  const busy = disabled || accept.isPending || reject.isPending;

  return (
    <MilaSuggestion
      reason={suggestion.explanation}
      sources={<Citations citations={suggestion.citations} />}
      actions={
        <>
          <Button
            size="sm"
            variant="mila"
            disabled={busy}
            onClick={() => accept.execute({ value: suggestion.payload.value })}
          >
            <Check aria-hidden />
            {t('ai.useValue')}
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => reject.execute()}>
            <X aria-hidden />
            {t('ai.notNeeded')}
          </Button>
        </>
      }
    >
      <p className="text-sm font-bold text-mila">
        {t('ai.fillIn', { field: t(`ai.eventField.${suggestion.payload.field}`) })}
      </p>
      <p className="font-bold whitespace-pre-line">{suggestion.payload.value}</p>
    </MilaSuggestion>
  );
}
