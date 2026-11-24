'use client';

import { Archive, ArchiveRestore, MoreHorizontal, Pencil } from 'lucide-react';
import { useAction } from 'next-safe-action/hooks';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import type { Supplier } from '@/api/generated/types.gen';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { archiveSupplier, unarchiveSupplier, updateSupplier } from '@/server/suppliers/actions';
import { supplierToForm } from './schemas';
import { SupplierForm } from './supplier-form';

/**
 * On a supplier's page: edit it in a side sheet (every member), archive or unarchive it
 * (owners and admins). There is no delete: the budget keeps referring to it.
 */
export function SupplierActions({
  supplier,
  canArchive,
}: {
  supplier: Supplier;
  canArchive: boolean;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const onError = ({ error }: { error: { serverError?: { message: string } } }) =>
    toast.error(t((error.serverError?.message ?? 'common.genericError') as never));
  const archive = useAction(archiveSupplier.bind(null, supplier.id), {
    onSuccess: () => {
      setArchiving(false);
      toast.success(t('suppliers.archivedToast', { name: supplier.name }));
      router.refresh();
    },
    onError,
  });
  const unarchive = useAction(unarchiveSupplier.bind(null, supplier.id), {
    onSuccess: () => {
      toast.success(t('suppliers.unarchivedToast', { name: supplier.name }));
      router.refresh();
    },
    onError,
  });
  const archived = supplier.archivedAt !== null;

  return (
    <>
      <Button variant="secondary" onClick={() => setEditing(true)}>
        <Pencil data-icon="inline-start" aria-hidden />
        {t('suppliers.edit')}
      </Button>
      {canArchive && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t('suppliers.actions', { name: supplier.name })}
            >
              <MoreHorizontal aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {archived ? (
              <DropdownMenuItem disabled={unarchive.isPending} onSelect={() => unarchive.execute()}>
                <ArchiveRestore aria-hidden />
                {t('suppliers.unarchive')}
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onSelect={() => setArchiving(true)}>
                <Archive aria-hidden />
                {t('suppliers.archive')}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <Sheet open={editing} onOpenChange={setEditing}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="text-lg">{t('suppliers.editTitle')}</SheetTitle>
            <SheetDescription>{t('suppliers.editDescription')}</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-6">
            <SupplierForm
              key={supplier.updatedAt}
              action={updateSupplier.bind(null, supplier.id)}
              defaultValues={supplierToForm(supplier)}
              submitLabel={t('common.save')}
              onDone={() => {
                toast.success(t('suppliers.saved'));
                setEditing(false);
              }}
              onCancel={() => setEditing(false)}
            />
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={archiving} onOpenChange={setArchiving}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('suppliers.archiveTitle', { name: supplier.name })}
            </AlertDialogTitle>
            <AlertDialogDescription>{t('suppliers.archiveWarning')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={archive.isPending}
              onClick={(event) => {
                // Keep the dialog open until the server answers.
                event.preventDefault();
                archive.execute();
              }}
            >
              {t('suppliers.archive')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
