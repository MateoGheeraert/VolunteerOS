'use client';

import { useTranslations } from 'next-intl';
import { useEffect, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';

/**
 * A form saved by the button at the bottom of its modal, outside the form (the files between them
 * have forms of their own). The form takes `formId` as its id and reports when a save runs.
 */
export interface OutsideSave {
  formId: string;
  onPendingChange: (pending: boolean) => void;
}

/** In a form with an `OutsideSave`: keeps the button outside it disabled while saving. */
export function useOutsideSave(outsideSave: OutsideSave | undefined, pending: boolean) {
  const onPendingChange = outsideSave?.onPendingChange;
  useEffect(() => onPendingChange?.(pending), [onPendingChange, pending]);
}

/**
 * The last row of an edit modal: "Opslaan" on the left, the record's other actions (delete, …) on
 * the right. `formId` is the form it saves; null when this user can't change anything.
 */
export function ModalActions({
  formId,
  saving,
  children,
}: {
  formId: string | null;
  saving: boolean;
  children?: ReactNode;
}) {
  const t = useTranslations();
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-border pt-5">
      {formId && (
        <Button type="submit" form={formId} disabled={saving}>
          {t('common.save')}
        </Button>
      )}
      <div className="ml-auto flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}
