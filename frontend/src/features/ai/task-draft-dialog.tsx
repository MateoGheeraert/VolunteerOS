'use client';

import { ArrowLeft, Plus, Sparkles, TriangleAlert } from 'lucide-react';
import { useAction } from 'next-safe-action/hooks';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import type { DraftTask, TaskDraft } from '@/api/generated/types.gen';
import { FormError } from '@/components/form-error';
import { MILA_NAME, MilaBadge, MilaBubble, MilaThinking } from '@/components/mila';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { TASK_PRIORITIES } from '@/features/tasks/schemas';
import { useTasksContext } from '@/features/tasks/tasks-context';
import type { MessageKey } from '@/i18n/keys';
import { createDraftTasks, draftTasks } from '@/server/ai/actions';

/** A drafted task as the organizer is editing it, with whether they keep it. */
type Row = DraftTask & { keep: boolean };

/**
 * "Help me taken maken": the organizer writes or pastes their own list, Mila turns it into tasks
 * (titles, deadlines, who does it), and the organizer checks them and creates the ones they keep
 * in one go. Nothing is created before that last click.
 */
export function TaskDraftDialog({
  eventId,
  open,
  onOpenChange,
}: {
  eventId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations();
  const router = useRouter();
  const { members } = useTasksContext();
  const [text, setText] = useState('');
  const [draft, setDraft] = useState<{ runId: string; rows: Row[] } | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);

  const reset = () => {
    setText('');
    setDraft(null);
    setError(null);
  };

  const read = useAction(draftTasks.bind(null, eventId), {
    onExecute: () => setError(null),
    onSuccess: ({ data }: { data?: TaskDraft }) => {
      if (!data) return;
      setDraft({
        runId: data.runId,
        rows: data.tasks.map((task) => ({ ...task, keep: task.duplicateOf === null })),
      });
    },
    onError: ({ error: e }) => setError(e.serverError?.message ?? 'common.genericError'),
  });

  const kept = draft?.rows.filter((row) => row.keep && row.title.trim()) ?? [];
  const create = useAction(createDraftTasks.bind(null, eventId, draft?.runId ?? ''), {
    onExecute: () => setError(null),
    onSuccess: () => {
      toast.success(t('ai.drafts.created', { count: kept.length }));
      router.refresh();
      reset();
      onOpenChange(false);
    },
    onError: ({ error: e }) => setError(e.serverError?.message ?? 'common.genericError'),
  });

  const update = (index: number, patch: Partial<Row>) =>
    setDraft((current) =>
      current
        ? {
            ...current,
            rows: current.rows.map((row, i) => (i === index ? { ...row, ...patch } : row)),
          }
        : current,
    );

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen && !read.isPending && !create.isPending) reset();
        onOpenChange(isOpen);
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <MilaBadge label={MILA_NAME} className="self-start" />
          <DialogTitle>{t('ai.drafts.title')}</DialogTitle>
          <DialogDescription>{t('ai.drafts.subtitle')}</DialogDescription>
        </DialogHeader>

        {!draft ? (
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (text.trim()) read.execute({ text });
            }}
          >
            <Textarea
              rows={7}
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={t('ai.drafts.placeholder')}
              aria-label={t('ai.drafts.title')}
              maxLength={4000}
              disabled={read.isPending}
            />
            {read.isPending && (
              <MilaThinking>{t('ai.drafts.reading', { name: MILA_NAME })}</MilaThinking>
            )}
            <FormError message={error} />
            <Button
              type="submit"
              variant="mila"
              className="self-end"
              disabled={read.isPending || !text.trim()}
            >
              <Sparkles aria-hidden />
              {t('ai.drafts.read', { name: MILA_NAME })}
            </Button>
          </form>
        ) : (
          <div className="flex flex-col gap-4">
            {draft.rows.length === 0 ? (
              <MilaBubble message={t('ai.drafts.nothingFound')} />
            ) : (
              <>
                <MilaBubble
                  message={t('ai.drafts.found', { count: draft.rows.length })}
                  detail={t('ai.drafts.check')}
                />
                <ul className="flex flex-col gap-2">
                  {draft.rows.map((row, index) => (
                    <DraftRow
                      key={index}
                      row={row}
                      index={index}
                      members={members}
                      onChange={(patch) => update(index, patch)}
                    />
                  ))}
                </ul>
              </>
            )}
            <FormError message={error} />
            <div className="flex flex-wrap justify-between gap-2">
              <Button variant="ghost" onClick={() => setDraft(null)} disabled={create.isPending}>
                <ArrowLeft aria-hidden />
                {t('ai.drafts.back')}
              </Button>
              <Button
                variant="mila"
                disabled={kept.length === 0 || create.isPending}
                onClick={() =>
                  create.execute({
                    tasks: kept.map(({ keep: _keep, duplicateOf: _dup, ...task }) => ({
                      ...task,
                      title: task.title.trim(),
                    })),
                  })
                }
              >
                <Plus aria-hidden />
                {t('ai.drafts.create', { count: kept.length })}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

const EXTERNAL = '__external';

function DraftRow({
  row,
  index,
  members,
  onChange,
}: {
  row: Row;
  index: number;
  members: { userId: string; name: string }[];
  onChange: (patch: Partial<Row>) => void;
}) {
  const t = useTranslations();
  const id = `draft-${index}`;
  const assignee = row.assigneeUserId ?? (row.assigneeName ? EXTERNAL : '');

  return (
    <li className="flex flex-col gap-2 rounded-2xl bg-card p-3 shadow-soft">
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          className="size-4 accent-mila"
          checked={row.keep}
          onChange={(event) => onChange({ keep: event.target.checked })}
          aria-label={t('ai.drafts.keep', { title: row.title })}
        />
        <Input
          id={id}
          value={row.title}
          maxLength={200}
          onChange={(event) => onChange({ title: event.target.value })}
          aria-label={t('taskForm.title')}
          className="h-9 font-bold"
        />
      </div>
      {row.duplicateOf && (
        <p className="flex items-center gap-1.5 pl-7 text-xs font-bold text-status-warn">
          <TriangleAlert className="size-3.5" aria-hidden />
          {t('ai.drafts.duplicate', { title: row.duplicateOf })}
        </p>
      )}
      {row.description && <p className="pl-7 text-sm text-muted-foreground">{row.description}</p>}
      <div className="grid gap-2 pl-7 sm:grid-cols-3">
        <NativeSelect
          value={row.priority}
          onChange={(event) => onChange({ priority: event.target.value as Row['priority'] })}
          aria-label={t('taskForm.priority')}
        >
          {TASK_PRIORITIES.map((value) => (
            <option key={value} value={value}>
              {t(`taskPriority.${value}`)}
            </option>
          ))}
        </NativeSelect>
        <Input
          type="date"
          value={row.dueDate ?? ''}
          onChange={(event) => onChange({ dueDate: event.target.value || null })}
          aria-label={t('taskForm.dueDate')}
          className="h-9"
        />
        <NativeSelect
          value={assignee}
          onChange={(event) => {
            const value = event.target.value;
            if (value === EXTERNAL) return;
            onChange({ assigneeUserId: value || null, assigneeName: null });
          }}
          aria-label={t('taskForm.assignee')}
        >
          <option value="">{t('ai.drafts.nobody')}</option>
          {row.assigneeName && <option value={EXTERNAL}>{row.assigneeName}</option>}
          {members.map((member) => (
            <option key={member.userId} value={member.userId}>
              {member.name}
            </option>
          ))}
        </NativeSelect>
      </div>
    </li>
  );
}
