'use client';

import { Trash2 } from 'lucide-react';
import { useAction } from 'next-safe-action/hooks';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { TaskLabel } from '@/api/generated/types.gen';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { createTaskLabel, deleteTaskLabel, updateTaskLabel } from '@/server/tasks/actions';
import { LABEL_COLORS, type LabelColor } from './schemas';
import { LabelChip } from './task-badges';
import { useActionFeedback, useTasksContext } from './tasks-context';

/** Managers add, rename, recolor and delete the event's labels. */
export function LabelManager({
  eventId,
  open,
  onOpenChange,
}: {
  eventId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations();
  const { labels } = useTasksContext();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="text-lg">{t('taskLabels.title')}</SheetTitle>
          <SheetDescription>{t('taskLabels.description')}</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-4 px-4 pb-6">
          {labels.length === 0 ? (
            <p className="text-muted-foreground">{t('taskLabels.empty')}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {labels.map((label) => (
                // key with updatedAt: fresh inputs after a save
                <LabelRow key={`${label.id}-${label.updatedAt}`} eventId={eventId} label={label} />
              ))}
            </ul>
          )}
          <NewLabel eventId={eventId} />
        </div>
      </SheetContent>
    </Sheet>
  );
}

function LabelFields({
  name,
  color,
  onName,
  onColor,
  idPrefix,
}: {
  name: string;
  color: LabelColor;
  onName: (name: string) => void;
  onColor: (color: LabelColor) => void;
  idPrefix: string;
}) {
  const t = useTranslations();
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_8.5rem] gap-2">
      <Input
        id={`${idPrefix}-name`}
        aria-label={t('taskLabels.name')}
        value={name}
        maxLength={50}
        onChange={(event) => onName(event.target.value)}
      />
      <NativeSelect
        aria-label={t('taskLabels.color')}
        value={color}
        onChange={(event) => onColor(event.target.value as LabelColor)}
      >
        {LABEL_COLORS.map((value) => (
          <option key={value} value={value}>
            {t(`labelColor.${value}`)}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}

function LabelRow({ eventId, label }: { eventId: string; label: TaskLabel }) {
  const t = useTranslations();
  const feedback = useActionFeedback();
  const [name, setName] = useState(label.name);
  const [color, setColor] = useState<LabelColor>(label.color);
  const [confirming, setConfirming] = useState(false);
  const save = useAction(updateTaskLabel.bind(null, eventId, label.id), feedback);
  const remove = useAction(deleteTaskLabel.bind(null, eventId, label.id), feedback);
  const changed = name.trim() !== label.name || color !== label.color;
  const busy = save.isPending || remove.isPending;

  return (
    <li className="flex flex-col gap-2 rounded-2xl bg-muted/50 p-3">
      <div className="flex items-center justify-between gap-2">
        <LabelChip label={{ name: name.trim() || label.name, color }} />
        {confirming ? (
          <span className="flex gap-1">
            <Button
              size="sm"
              variant="destructive"
              disabled={busy}
              onClick={() => remove.execute()}
            >
              {t('taskLabels.deleteConfirm')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              {t('common.cancel')}
            </Button>
          </span>
        ) : (
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={t('taskLabels.delete', { name: label.name })}
            onClick={() => setConfirming(true)}
          >
            <Trash2 aria-hidden />
          </Button>
        )}
      </div>
      <LabelFields
        idPrefix={label.id}
        name={name}
        color={color}
        onName={setName}
        onColor={setColor}
      />
      {changed && (
        <Button
          size="sm"
          className="w-fit"
          disabled={busy || !name.trim()}
          onClick={() => save.execute({ name, color })}
        >
          {t('common.save')}
        </Button>
      )}
    </li>
  );
}

function NewLabel({ eventId }: { eventId: string }) {
  const t = useTranslations();
  const feedback = useActionFeedback();
  const [name, setName] = useState('');
  const [color, setColor] = useState<LabelColor>('blue');
  const { onSuccess, onError } = feedback;
  const create = useAction(createTaskLabel.bind(null, eventId), {
    onSuccess: () => {
      setName('');
      onSuccess();
    },
    onError,
  });

  return (
    <form
      className="flex flex-col gap-2 border-t border-border pt-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (name.trim()) create.execute({ name, color });
      }}
    >
      <h3 className="text-sm font-bold">{t('taskLabels.newLabel')}</h3>
      <LabelFields idPrefix="new" name={name} color={color} onName={setName} onColor={setColor} />
      <Button type="submit" size="sm" className="w-fit" disabled={!name.trim() || create.isPending}>
        {t('taskLabels.add')}
      </Button>
    </form>
  );
}
