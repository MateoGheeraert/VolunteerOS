'use client';

import { ListPlus, Search } from 'lucide-react';
import { useAction } from 'next-safe-action/hooks';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useActionFeedback } from '@/features/tasks/tasks-context';
import { requestTaskSuggestions } from '@/server/ai/actions';
import { TaskDraftDialog } from './task-draft-dialog';

/**
 * Mila's two ways to help with tasks: look for what's missing (compared with last year and with
 * events like this one), or turn the organizer's own list into tasks.
 */
export function MilaTaskActions({
  eventId,
  thinking,
  size = 'sm',
}: {
  eventId: string;
  thinking: boolean;
  size?: 'sm' | 'default';
}) {
  const t = useTranslations();
  const feedback = useActionFeedback();
  const request = useAction(requestTaskSuggestions.bind(null, eventId), feedback);
  const [drafting, setDrafting] = useState(false);

  return (
    <>
      <Button
        size={size}
        variant="mila"
        disabled={thinking || request.isPending}
        onClick={() => request.execute()}
      >
        <Search aria-hidden />
        {t('ai.findMissing')}
      </Button>
      <Button size={size} variant="mila-soft" onClick={() => setDrafting(true)}>
        <ListPlus aria-hidden />
        {t('ai.helpCreate')}
      </Button>
      <TaskDraftDialog eventId={eventId} open={drafting} onOpenChange={setDrafting} />
    </>
  );
}
