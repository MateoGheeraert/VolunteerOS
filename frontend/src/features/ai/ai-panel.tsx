'use client';

import { useTranslations } from 'next-intl';
import type { AiEventState } from '@/api/generated/types.gen';
import { MILA_NAME, MilaPanel, MilaThinking } from '@/components/mila';
import { TasksProvider, type TasksContextValue } from '@/features/tasks/tasks-context';
import { MilaTaskActions } from './mila-actions';
import { MilaSuggestions, useMilaState } from './mila-suggestions';
import { useAiLive } from './use-ai-live';

type TasksContext = TasksContextValue & { event: { id: string; endsAt: string } };

/**
 * Mila on the event overview, for the people who manage it: her two task helpers and what she
 * proposes, in a box that scrolls on its own so the page doesn't grow with her suggestions.
 */
export function AiPanel({ state, tasks }: { state: AiEventState; tasks: TasksContext }) {
  const t = useTranslations();
  const eventId = tasks.event.id;
  useAiLive(eventId, state.enabled);
  const { thinking, failed, suggestions } = useMilaState(state);

  if (!state.enabled) {
    return (
      <MilaPanel subtitle={t('ai.subtitle')}>
        <p className="text-sm text-mila-ink/75">{t('ai.disabled')}</p>
      </MilaPanel>
    );
  }

  return (
    <TasksProvider value={tasks}>
      <MilaPanel subtitle={t('ai.subtitle')} thinking={thinking}>
        {!tasks.readOnly && (
          <div className="flex flex-wrap gap-2">
            <MilaTaskActions eventId={eventId} thinking={thinking} />
          </div>
        )}
        {thinking && <MilaThinking>{t('ai.thinking', { name: MILA_NAME })}</MilaThinking>}
        {!thinking && suggestions.length === 0 && (
          <p className="text-sm text-mila-ink/75">{t(failed ? 'ai.failed' : 'ai.empty')}</p>
        )}
        {suggestions.length > 0 && (
          <div className="-mx-1 max-h-[34rem] overflow-y-auto px-1 pb-1">
            <MilaSuggestions eventId={eventId} suggestions={suggestions} />
          </div>
        )}
      </MilaPanel>
    </TasksProvider>
  );
}
