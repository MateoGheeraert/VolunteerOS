'use client';

import { Tags } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import type { Label } from '@/api/generated/types.gen';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { LabelChip, labelsOf } from './label-chip';
import { LabelPicker } from './label-picker';

/**
 * Tag something in one click, without leaving the list: the chosen labels as chips, and a
 * button that opens the event's labels to toggle (or create one). `onChange` gets every change.
 */
export function LabelPopover({
  eventId,
  labels,
  value,
  onChange,
  itemName,
  disabled = false,
}: {
  eventId: string;
  labels: Label[];
  value: string[];
  onChange: (ids: string[]) => void;
  /** What is being tagged, for the button's accessible name. */
  itemName: string;
  disabled?: boolean;
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  // The selection right now: creating a label is async, and others may be toggled meanwhile.
  const current = useRef(value);
  useEffect(() => {
    current.current = value;
  }, [value]);
  const chosen = labelsOf(labels, value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <span className="flex flex-wrap items-center gap-1">
        {chosen.map((label) => (
          <LabelChip key={label.id} label={label} />
        ))}
        <PopoverTrigger asChild>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            disabled={disabled}
            className="size-7 text-muted-foreground"
            aria-label={t('labels.tagItem', { name: itemName })}
            title={t('labels.tag')}
          >
            <Tags aria-hidden />
          </Button>
        </PopoverTrigger>
      </span>
      <PopoverContent align="start" className="w-80">
        <LabelPicker
          eventId={eventId}
          labels={labels}
          value={value}
          onChange={onChange}
          current={() => current.current}
          legend={t('labels.title')}
        />
      </PopoverContent>
    </Popover>
  );
}
