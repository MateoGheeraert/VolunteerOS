'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { AiEventState } from '@/api/generated/types.gen';
import { MILA_NAME, MilaAvatar } from '@/components/mila';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { AiPanel } from '@/features/ai/ai-panel';
import { useAiLive } from '@/features/ai/use-ai-live';
import type { MilaTasksContext } from '@/features/ai/mila-context';

/**
 * "Vraag Mila" in the overview's header: Mila in full (her helpers, questions and suggestions) in
 * a large modal. The button counts her open questions. It also keeps the overview live, so her
 * hints and the cards follow her runs.
 */
export function AskMila({
  state,
  tasks,
  openQuestions,
}: {
  state: AiEventState;
  tasks: MilaTasksContext;
  openQuestions: number;
}) {
  const t = useTranslations('overview');
  const [open, setOpen] = useState(false);
  useAiLive(tasks.event.id, state.enabled);

  return (
    <>
      <Button variant="mila-soft" onClick={() => setOpen(true)}>
        <MilaAvatar size="xs" />
        {t('askMila', { name: MILA_NAME })}
        {openQuestions > 0 && (
          <>
            <span
              aria-hidden
              className="grid h-5 min-w-5 place-items-center rounded-full bg-mila px-1.5 text-xs text-white"
            >
              {openQuestions}
            </span>
            <span className="sr-only">{t('openQuestions', { count: openQuestions })}</span>
          </>
        )}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="lg" className="border-0 bg-mila-tint p-0">
          <DialogTitle className="sr-only">{t('askMilaTitle', { name: MILA_NAME })}</DialogTitle>
          <AiPanel state={state} tasks={tasks} live={false} className="border-0 pr-14" />
        </DialogContent>
      </Dialog>
    </>
  );
}
