'use client';

import { Trash2 } from 'lucide-react';
import { useAction } from 'next-safe-action/hooks';
import { useTranslations } from 'next-intl';
import type { AiMemory } from '@/api/generated/types.gen';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useActionFeedback } from '@/features/tasks/tasks-context';
import { deleteAiMemory } from '@/server/ai/actions';
import { Citations } from './suggestion-cards';

/** The agent's memory, newest first. Deleting a wrong fact keeps it out of every later run. */
export function AiMemoryList({ memories }: { memories: AiMemory[] }) {
  const t = useTranslations();
  if (memories.length === 0) {
    return <p className="text-sm text-mila-ink/75">{t('ai.memory.empty')}</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {memories.map((memory) => (
        <MemoryRow key={memory.id} memory={memory} />
      ))}
    </ul>
  );
}

function MemoryRow({ memory }: { memory: AiMemory }) {
  const t = useTranslations();
  const feedback = useActionFeedback();
  const remove = useAction(deleteAiMemory.bind(null, memory.id), feedback);

  return (
    <li className="flex items-start justify-between gap-3 rounded-card bg-card p-4 shadow-soft">
      <div className="flex min-w-0 flex-col gap-1">
        <p>{memory.content}</p>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="secondary" className="bg-mila-tint text-mila-ink">
            {memory.event?.name ?? t('ai.memory.organization')}
          </Badge>
          <span className="text-muted-foreground">{t(`ai.memory.source.${memory.source}`)}</span>
          {memory.copiedFromPreviousEdition && (
            <span className="text-muted-foreground">{t('ai.memory.fromLastYear')}</span>
          )}
        </div>
        <Citations citations={memory.citations} />
      </div>
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label={t('ai.memory.delete')}
        disabled={remove.isPending}
        onClick={() => remove.execute()}
      >
        <Trash2 aria-hidden />
      </Button>
    </li>
  );
}
