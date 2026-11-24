'use client';

import { Plus } from 'lucide-react';
import { useAction } from 'next-safe-action/hooks';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import type { Label } from '@/api/generated/types.gen';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { createLabel } from '@/server/labels/actions';
import { LabelChip } from './label-chip';
import { LABEL_NAME_MAX, nextLabelColor } from './schemas';

/**
 * Toggle the event's labels in a form (a task, a budget entry); managers can add a new one on
 * the spot, which gets selected.
 */
export function LabelPicker({
  eventId,
  labels,
  value,
  onChange,
  current,
  legend,
}: {
  eventId: string;
  labels: Label[];
  value: string[];
  onChange: (ids: string[]) => void;
  /** The selection right now: creating a label is async, and others may be toggled meanwhile. */
  current: () => string[];
  legend: string;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [name, setName] = useState('');
  // Labels made in this form, until the page data includes them.
  const [added, setAdded] = useState<Label[]>([]);
  const all = [...labels, ...added.filter((a) => !labels.some((l) => l.id === a.id))];

  const create = useAction(createLabel.bind(null, eventId), {
    onSuccess: ({ data }) => {
      if (!data) return;
      setAdded((current) => [...current, data]);
      onChange([...current(), data.id]);
      setName('');
      router.refresh();
    },
    onError: ({ error }) => toast.error(t(error.serverError?.message ?? 'common.genericError')),
  });
  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  const add = () => {
    if (name.trim()) create.execute({ name, color: nextLabelColor(all.length) });
  };

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-bold">{legend}</legend>
      {all.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {all.map((label) => {
            const selected = value.includes(label.id);
            return (
              <button
                key={label.id}
                type="button"
                aria-pressed={selected}
                onClick={() => toggle(label.id)}
                className={cn(
                  'rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                  !selected && 'opacity-45 hover:opacity-80',
                )}
              >
                <LabelChip label={label} className={cn(selected && 'ring-2 ring-current/40')} />
              </button>
            );
          })}
        </div>
      )}
      <div className="flex gap-2">
        <Input
          aria-label={t('labels.newLabel')}
          placeholder={t('labels.newLabelPlaceholder')}
          value={name}
          maxLength={LABEL_NAME_MAX}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              add();
            }
          }}
        />
        <Button
          type="button"
          variant="secondary"
          disabled={!name.trim() || create.isPending}
          onClick={add}
        >
          <Plus data-icon="inline-start" aria-hidden />
          {t('labels.add')}
        </Button>
      </div>
    </fieldset>
  );
}
