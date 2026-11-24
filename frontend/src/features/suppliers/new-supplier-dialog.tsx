'use client';

import { useTranslations } from 'next-intl';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { createSupplier } from '@/server/suppliers/actions';
import { emptySupplier } from './schemas';
import { SupplierForm } from './supplier-form';

/**
 * A new supplier, in a dialog: from the directory, or from the supplier picker of a budget entry
 * (which then selects it). `initialName` is what was typed in the picker.
 */
export function NewSupplierDialog({
  open,
  onOpenChange,
  initialName = '',
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialName?: string;
  onCreated: (supplier: { id: string; name: string }) => void;
}) {
  const t = useTranslations();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('suppliers.createTitle')}</DialogTitle>
          <DialogDescription>{t('suppliers.createDescription')}</DialogDescription>
        </DialogHeader>
        {open && (
          <SupplierForm
            action={createSupplier}
            defaultValues={emptySupplier(initialName)}
            submitLabel={t('suppliers.create')}
            onDone={(supplier) => {
              onCreated(supplier);
              onOpenChange(false);
            }}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
