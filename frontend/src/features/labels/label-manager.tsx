'use client';

import { Trash2 } from 'lucide-react';
import { useAction } from 'next-safe-action/hooks';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import type { Label } from '@/api/generated/types.gen';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { ActionError } from '@/server/action-client';
import { createLabel, deleteLabel, getLabelUsage, updateLabel } from '@/server/labels/actions';
import { LabelChip } from './label-chip';
import { LABEL_COLORS, LABEL_NAME_MAX, type LabelColor } from './schemas';

/**
 * Managers add, rename, recolor and delete the event's labels. The same labels show on tasks and
 * budget entries, so this opens from both pages.
 */
export function LabelManager({
  eventId,
  labels,
  open,
  onOpenChange,
}: {
  eventId: string;
  labels: Label[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{t('labels.title')}</DialogTitle>
          <DialogDescription>{t('labels.description')}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {labels.length === 0 ? (
            <p className="text-muted-foreground">{t('labels.empty')}</p>
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
      </DialogContent>
    </Dialog>
  );
}

/** A success refreshes the page data; a failure gets a toast. */
function useFeedback() {
  const t = useTranslations();
  const router = useRouter();
  return {
    onSuccess: () => router.refresh(),
    onError: ({ error }: { error: { serverError?: ActionError } }) =>
      toast.error(t(error.serverError?.message ?? 'common.genericError')),
  };
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
        aria-label={t('labels.name')}
        value={name}
        maxLength={LABEL_NAME_MAX}
        onChange={(event) => onName(event.target.value)}
      />
      <NativeSelect
        aria-label={t('labels.color')}
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

function LabelRow({ eventId, label }: { eventId: string; label: Label }) {
  const t = useTranslations();
  const feedback = useFeedback();
  const [name, setName] = useState(label.name);
  const [color, setColor] = useState<LabelColor>(label.color);
  const save = useAction(updateLabel.bind(null, eventId, label.id), feedback);
  const remove = useAction(deleteLabel.bind(null, eventId, label.id), feedback);
  // Asking what carries the label opens the confirmation, which says what deleting touches.
  const usage = useAction(getLabelUsage.bind(null, eventId, label.id), {
    onError: feedback.onError,
  });
  const confirming = usage.hasSucceeded && usage.result.data !== undefined;
  const changed = name.trim() !== label.name || color !== label.color;
  const busy = save.isPending || remove.isPending || usage.isPending;

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
              {t('labels.deleteConfirm')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => usage.reset()}>
              {t('common.cancel')}
            </Button>
          </span>
        ) : (
          <Button
            size="icon-sm"
            variant="ghost"
            disabled={busy}
            aria-label={t('labels.delete', { name: label.name })}
            onClick={() => usage.execute()}
          >
            <Trash2 aria-hidden />
          </Button>
        )}
      </div>
      {confirming && usage.result.data && (
        <output className="text-sm text-muted-foreground">
          {usage.result.data.tasks + usage.result.data.budgetEntries === 0
            ? t('labels.unused')
            : t('labels.usedBy', {
                tasks: usage.result.data.tasks,
                budgetEntries: usage.result.data.budgetEntries,
              })}
        </output>
      )}
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
  const { onSuccess, onError } = useFeedback();
  const [name, setName] = useState('');
  const [color, setColor] = useState<LabelColor>('blue');
  const create = useAction(createLabel.bind(null, eventId), {
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
      <h3 className="text-sm font-bold">{t('labels.newLabel')}</h3>
      <LabelFields idPrefix="new" name={name} color={color} onName={setName} onColor={setColor} />
      <Button type="submit" size="sm" className="w-fit" disabled={!name.trim() || create.isPending}>
        {t('labels.add')}
      </Button>
    </form>
  );
}
