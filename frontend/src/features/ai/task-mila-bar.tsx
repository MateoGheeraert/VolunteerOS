'use client';

import { PanelRightOpen } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { AiEventState } from '@/api/generated/types.gen';
import { MILA_NAME, MilaAvatar, MilaBar, MilaThinking } from '@/components/mila';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { TasksProvider, type TasksContextValue } from '@/features/tasks/tasks-context';
import { MilaTaskActions } from './mila-actions';
import { MilaSuggestions, useMilaState } from './mila-suggestions';
import { useAiLive } from './use-ai-live';

type TasksContext = TasksContextValue & { event: { id: string; endsAt: string } };

/**
 * Mila on the task page, in one line above the board, so the board is what you see first. Her
 * suggested tasks open in a side panel that scrolls on its own.
 */
export function TaskMilaBar({ state, tasks }: { state: AiEventState; tasks: TasksContext }) {
  const t = useTranslations();
  const eventId = tasks.event.id;
  useAiLive(eventId, state.enabled);
  const { thinking, failed, suggestions } = useMilaState(state, 'task_suggestion');
  const [open, setOpen] = useState(false);
  if (!state.enabled) return null;

  const count = suggestions.length;
  const message = thinking
    ? t('ai.bar.thinking', { name: MILA_NAME })
    : count > 0
      ? t('ai.bar.suggestions', { name: MILA_NAME, count })
      : t('ai.bar.idle', { name: MILA_NAME });

  return (
    <TasksProvider value={tasks}>
      <MilaBar
        thinking={thinking}
        message={message}
        detail={!thinking && count === 0 && failed ? t('ai.failed') : t('ai.bar.detail')}
        actions={
          <>
            {count > 0 && (
              <Button size="sm" variant="mila" onClick={() => setOpen(true)}>
                <PanelRightOpen aria-hidden />
                {t('ai.bar.open', { count })}
              </Button>
            )}
            <MilaTaskActions eventId={eventId} thinking={thinking} />
          </>
        }
      />

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full gap-0 overflow-y-auto bg-mila-tint sm:max-w-lg">
          <SheetHeader className="flex-row items-center gap-3">
            <MilaAvatar thinking={thinking} />
            <div className="flex flex-col">
              <SheetTitle className="text-mila-ink">
                {t('ai.sheet.title', { name: MILA_NAME })}
              </SheetTitle>
              <SheetDescription className="text-mila-ink/75">
                {t('ai.sheet.subtitle')}
              </SheetDescription>
            </div>
          </SheetHeader>
          <div className="flex flex-col gap-4 px-4 pb-6">
            {thinking && <MilaThinking>{t('ai.thinking', { name: MILA_NAME })}</MilaThinking>}
            {count === 0 && !thinking && (
              <p className="text-sm text-mila-ink/75">{t('ai.empty')}</p>
            )}
            <MilaSuggestions eventId={eventId} suggestions={suggestions} />
          </div>
        </SheetContent>
      </Sheet>
    </TasksProvider>
  );
}
