'use client';

import { ListPlus, PanelRightOpen, Search, Shuffle, Sparkles, X } from 'lucide-react';
import Link from 'next/link';
import { useAction } from 'next-safe-action/hooks';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { MILA_NAME, MilaAvatar, MilaThinking } from '@/components/mila';
import { Button } from '@/components/ui/button';
import { TaskDraftDialog } from '@/features/ai/task-draft-dialog';
import { useActionFeedback } from '@/features/tasks/tasks-context';
import { requestTaskSuggestions } from '@/server/ai/actions';
import { requestAllocation, requestShiftSuggestions } from '@/server/ai/planning-actions';
import { dismissMilaHint } from '@/server/events/overview-actions';
import type { MilaHint as Hint } from './overview-types';

/**
 * Mila's hint in a card. The highlighted one (at most one on the page) is shown in full: her face,
 * what she offers and her buttons. Others are a small chip that opens into the same thing, so she
 * is there without taking over. "Niet nu" puts the hint away until its situation changes.
 * Must be inside a TasksProvider: drafting tasks uses the task context.
 */
export function MilaHint({
  eventId,
  hint,
  pendingTaskSuggestions,
  pendingPlanningSuggestions = 0,
}: {
  eventId: string;
  hint: Hint;
  pendingTaskSuggestions: number;
  /** For the planning card's hints. */
  pendingPlanningSuggestions?: number;
}) {
  const t = useTranslations('overview.mila');
  const tAi = useTranslations('ai');
  const feedback = useActionFeedback();
  const [expanded, setExpanded] = useState(hint.highlighted);
  const [drafting, setDrafting] = useState(false);
  const dismiss = useAction(dismissMilaHint.bind(null, eventId), feedback);
  const find = useAction(requestTaskSuggestions.bind(null, eventId), feedback);
  const suggestShifts = useAction(requestShiftSuggestions.bind(null, eventId), feedback);
  const allocate = useAction(requestAllocation.bind(null, eventId), feedback);
  const planningCount = pendingPlanningSuggestions;
  const name = MILA_NAME;
  const count = pendingTaskSuggestions;

  const copy = {
    'tasks.setup': { title: t('setupTitle'), body: t('setupBody'), chip: t('setupChip', { name }) },
    'tasks.review': {
      title: t('reviewTitle', { count }),
      body: t('reviewBody'),
      chip: t('reviewChip', { count, name }),
    },
    'tasks.find_missing': {
      title: t('findTitle'),
      body: t('findBody'),
      chip: t('findChip', { name }),
    },
    'planning.setup': {
      title: t('planningSetupTitle'),
      body: t('planningSetupBody'),
      chip: t('planningSetupChip', { name }),
    },
    'planning.review': {
      title: t('planningReviewTitle', { count: planningCount }),
      body: t('planningReviewBody'),
      chip: t('planningReviewChip', { count: planningCount, name }),
    },
    'planning.allocate': {
      title: t('planningAllocateTitle'),
      body: t('planningAllocateBody'),
      chip: t('planningAllocateChip', { name }),
    },
  }[hint.key];

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="inline-flex items-center gap-1.5 self-start rounded-full bg-mila-tint py-1 pr-3 pl-1 text-xs font-bold text-mila-ink transition hover:brightness-95 focus-visible:ring-[3px] focus-visible:ring-mila-bright/50 focus-visible:outline-none"
      >
        <MilaAvatar size="xs" />
        {copy.chip}
      </button>
    );
  }

  const busy = dismiss.isPending || find.isPending || suggestShifts.isPending || allocate.isPending;
  return (
    <div className="flex flex-col gap-3 rounded-card border border-mila-tint-strong/60 bg-mila-tint p-4">
      <div className="flex items-start gap-3">
        <MilaAvatar size="sm" />
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="text-sm font-bold text-mila-ink">{copy.title}</p>
          <p className="text-xs text-mila-ink/75">{copy.body}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {hint.key === 'tasks.review' && (
          <Button asChild size="sm" variant="mila">
            <Link href={`/events/${eventId}/tasks?mila=voorstellen`}>
              <PanelRightOpen aria-hidden />
              {t('review')}
            </Link>
          </Button>
        )}
        {(hint.key === 'tasks.setup' || hint.key === 'tasks.find_missing') && (
          <Button size="sm" variant="mila" disabled={busy} onClick={() => find.execute()}>
            <Search aria-hidden />
            {tAi('findMissing')}
          </Button>
        )}
        {hint.key === 'planning.review' && (
          <Button asChild size="sm" variant="mila">
            <Link href={`/events/${eventId}/planning?mila=voorstellen`}>
              <PanelRightOpen aria-hidden />
              {t('review')}
            </Link>
          </Button>
        )}
        {hint.key === 'planning.setup' && (
          <Button
            size="sm"
            variant="mila"
            disabled={busy}
            onClick={() => suggestShifts.execute({ instruction: '' })}
          >
            <Sparkles aria-hidden />
            {t('planningSetupAction')}
          </Button>
        )}
        {hint.key === 'planning.allocate' && (
          <Button size="sm" variant="mila" disabled={busy} onClick={() => allocate.execute()}>
            <Shuffle aria-hidden />
            {t('planningAllocateAction')}
          </Button>
        )}
        {hint.key === 'tasks.setup' && (
          <>
            <Button size="sm" variant="mila-soft" onClick={() => setDrafting(true)}>
              <ListPlus aria-hidden />
              {tAi('helpCreate')}
            </Button>
            <TaskDraftDialog eventId={eventId} open={drafting} onOpenChange={setDrafting} />
          </>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="text-mila-ink/75 hover:text-mila-ink"
          disabled={busy}
          onClick={() => dismiss.execute({ hintKey: hint.key, fingerprint: hint.fingerprint })}
        >
          <X aria-hidden />
          {t('dismiss')}
        </Button>
      </div>
    </div>
  );
}

/** While Mila looks for missing tasks, in the task card. */
export function MilaFindingTasks() {
  const t = useTranslations('overview.mila');
  return <MilaThinking>{t('finding', { name: MILA_NAME })}</MilaThinking>;
}

/** While Mila suggests teams and shifts or divides volunteers, in the planning card. */
export function MilaWorkingOnPlanning() {
  const t = useTranslations('overview.mila');
  return <MilaThinking>{t('planningWorking', { name: MILA_NAME })}</MilaThinking>;
}
