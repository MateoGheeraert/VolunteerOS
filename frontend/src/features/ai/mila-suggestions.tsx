'use client';

import { Plus } from 'lucide-react';
import { useAction } from 'next-safe-action/hooks';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import type { AiEventState, AiSuggestion } from '@/api/generated/types.gen';
import { MILA_NAME, MilaBadge, MilaSuggestionList } from '@/components/mila';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { TaskForm } from '@/features/tasks/task-form';
import { useActionFeedback, useTasksContext } from '@/features/tasks/tasks-context';
import {
  acceptTaskSuggestion,
  acceptTaskSuggestionsAsIs,
  markSuggestionsSeen,
} from '@/server/ai/actions';
import { asIsItem, suggestionToTaskForm, type TaskSuggestion } from './schemas';
import { EventUpdateCard, QuestionCard, TaskSuggestionCard } from './suggestion-cards';

const TASK_SIDE_KINDS: AiSuggestion['kind'][] = ['task_suggestion', 'question', 'update_event'];

/** Mila's run and pending suggestions on an event, worked out once for every view of them. */
export function useMilaState(state: AiEventState, showOnly?: AiSuggestion['kind']) {
  const run = state.runs.find((candidate) => candidate.feature === 'task_suggestions');
  // The planning page shows Mila's planning cards itself; here only the task-side ones.
  const suggestions = state.suggestions.filter((s) =>
    showOnly ? s.kind === showOnly : TASK_SIDE_KINDS.includes(s.kind),
  );
  return {
    thinking: run?.status === 'queued' || run?.status === 'running',
    failed: run?.status === 'failed',
    suggestions,
  };
}

/**
 * Everything Mila proposes for an event, to decide on: her questions, values for empty event
 * fields, and missing tasks (tick several to add them at once, or open one to adjust it first).
 * Must be inside a TasksProvider: accepting a task uses the task dialog.
 */
export function MilaSuggestions({
  eventId,
  suggestions,
}: {
  eventId: string;
  suggestions: AiSuggestion[];
}) {
  const t = useTranslations();
  const { readOnly, event } = useTasksContext();
  const feedback = useActionFeedback();
  const questions = suggestions.filter((s) => s.kind === 'question');
  const updates = suggestions.filter((s) => s.kind === 'update_event');
  const taskSuggestions = suggestions.filter(
    (s): s is TaskSuggestion => s.kind === 'task_suggestion',
  );

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<TaskSuggestion | null>(null);
  const selectedSuggestions = taskSuggestions.filter((s) => selected.has(s.id));
  const acceptSelected = useAction(acceptTaskSuggestionsAsIs.bind(null, eventId), {
    ...feedback,
    onSuccess: () => {
      setSelected(new Set());
      feedback.onSuccess();
    },
  });
  const disabled = readOnly || acceptSelected.isPending;

  // Pilot metric "shown": report cards the first time they are on screen.
  const markSeen = useAction(markSuggestionsSeen.bind(null, eventId));
  const unseenKey = suggestions
    .filter((s) => s.seenAt === null)
    .map((s) => s.id)
    .join(',');
  useEffect(() => {
    if (unseenKey) markSeen.execute({ suggestionIds: unseenKey.split(',') });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per new set of cards
  }, [unseenKey]);

  return (
    <div className="flex flex-col gap-4">
      {questions.length > 0 && (
        <ul className="flex flex-col gap-4">
          {questions.map((suggestion) => (
            <QuestionCard
              key={suggestion.id}
              eventId={eventId}
              suggestion={suggestion}
              disabled={disabled}
            />
          ))}
        </ul>
      )}

      {updates.length > 0 && (
        <MilaSuggestionList>
          {updates.map((suggestion) => (
            <EventUpdateCard
              key={suggestion.id}
              eventId={eventId}
              suggestion={suggestion}
              disabled={disabled}
            />
          ))}
        </MilaSuggestionList>
      )}

      {taskSuggestions.length > 0 && (
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-bold text-mila-ink">
            {t('ai.taskSuggestionsTitle', { count: taskSuggestions.length })}
          </h3>
          <MilaSuggestionList>
            {taskSuggestions.map((suggestion) => (
              <TaskSuggestionCard
                key={suggestion.id}
                eventId={eventId}
                suggestion={suggestion}
                disabled={disabled}
                selected={selected.has(suggestion.id)}
                onSelectedChange={(isSelected) =>
                  setSelected((current) => {
                    const next = new Set(current);
                    if (isSelected) next.add(suggestion.id);
                    else next.delete(suggestion.id);
                    return next;
                  })
                }
                onEdit={() => setEditing(suggestion)}
              />
            ))}
          </MilaSuggestionList>
          {!readOnly && (
            <Button
              variant="mila"
              className="self-start"
              disabled={selectedSuggestions.length === 0 || disabled}
              onClick={() => acceptSelected.execute({ items: selectedSuggestions.map(asIsItem) })}
            >
              <Plus aria-hidden />
              {t('ai.addSelected', { count: selectedSuggestions.length })}
            </Button>
          )}
        </div>
      )}

      <Dialog open={editing !== null} onOpenChange={(isOpen) => !isOpen && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <MilaBadge label={t('ai.suggestedBy', { name: MILA_NAME })} className="self-start" />
            <DialogTitle>{t('ai.acceptTitle')}</DialogTitle>
            <DialogDescription>{t('ai.acceptSubtitle')}</DialogDescription>
          </DialogHeader>
          {editing && event && (
            <TaskForm
              key={editing.id}
              event={event}
              action={acceptTaskSuggestion.bind(null, eventId, editing.id)}
              defaultValues={suggestionToTaskForm(editing)}
              submitLabel={t('ai.addTask')}
              onDone={() => setEditing(null)}
              onCancel={() => setEditing(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
