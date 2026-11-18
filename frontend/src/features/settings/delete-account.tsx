'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, Trash2, TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { DeletionCheck } from '@/api/generated/types.gen';
import { FormError, FormFieldError } from '@/components/form-error';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { authClient } from '@/lib/auth-client';
import { deleteAccount } from '@/server/account/actions';
import { deleteAccountSchema } from './schemas';

/**
 * The danger zone of the account settings. While the user is the only owner of an organization
 * with other members, it lists those organizations (with a way to their Members page) and the
 * button stays disabled. Organizations where the user is the only member are deleted with the
 * account; it warns about those. Deleting is confirmed with the password.
 */
export function DeleteAccount({ check }: { check: DeletionCheck }) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const { blockingOrganizations: blocking, organizationsToDelete: toDelete } = check;

  return (
    <section className="flex flex-col gap-4 rounded-3xl border border-status-bad/30 bg-card p-5 shadow-soft sm:p-8">
      <h2 className="text-lg">{t('settings.delete.title')}</h2>
      <p className="text-muted-foreground">{t('settings.delete.body')}</p>

      {blocking.length > 0 && (
        <div
          role="alert"
          className="flex flex-col items-start gap-3 rounded-2xl bg-status-warn-bg p-4 text-sm"
        >
          <p className="flex items-start gap-2 font-semibold text-status-warn">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {t('settings.delete.blocked', { count: blocking.length })}
          </p>
          <ul className="flex flex-col gap-1">
            {blocking.map((organization) => (
              <li key={organization.id}>
                <MembersLink organizationId={organization.id} name={organization.name} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {blocking.length === 0 && toDelete.length > 0 && (
        <div className="flex flex-col gap-2 rounded-2xl bg-status-warn-bg p-4 text-sm">
          <p className="flex items-start gap-2 font-semibold text-status-warn">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {t('settings.delete.organizationsDeleted', { count: toDelete.length })}
          </p>
          <ul className="list-disc pl-10">
            {toDelete.map((organization) => (
              <li key={organization.id}>
                <span className="font-semibold">{organization.name}</span> (
                {t('settings.delete.eventCount', { count: organization.eventCount })})
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <Button variant="destructive" disabled={!check.canDelete} onClick={() => setOpen(true)}>
          <Trash2 aria-hidden />
          {t('settings.delete.button')}
        </Button>
      </div>
      <AlertDialog open={open} onOpenChange={setOpen}>
        {open && <ConfirmDialog />}
      </AlertDialog>
    </section>
  );
}

/** Opens the Members page of that organization: it becomes the active one first. */
function MembersLink({ organizationId, name }: { organizationId: string; name: string }) {
  const t = useTranslations();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function open() {
    setBusy(true);
    await authClient.organization.setActive({ organizationId });
    router.push('/members');
    router.refresh();
  }

  return (
    <Button variant="link" className="h-auto p-0" disabled={busy} onClick={() => void open()}>
      {t('settings.delete.toMembers', { organization: name })}
      <ArrowRight aria-hidden />
    </Button>
  );
}

function ConfirmDialog() {
  const t = useTranslations();
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm({
    resolver: zodResolver(deleteAccountSchema),
    defaultValues: { password: '' },
  });
  const [deleted, setDeleted] = useState(false);
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    const result = await deleteAccount(values);
    const error = result?.serverError;
    if (error) {
      if (error.fields?.includes('password')) {
        form.setError('password', { message: 'settings.account.wrongPassword' });
      } else {
        setFormError(error.message);
      }
      return;
    }
    setDeleted(true);
    // The session is already gone; this clears the cookie.
    await authClient.signOut();
    router.replace('/account-deleted');
    router.refresh();
  });

  const busy = isSubmitting || deleted;
  return (
    <AlertDialogContent>
      <form onSubmit={(event) => void onSubmit(event)} noValidate className="flex flex-col gap-4">
        <AlertDialogHeader>
          <AlertDialogTitle>{t('settings.delete.dialogTitle')}</AlertDialogTitle>
          <AlertDialogDescription>{t('settings.delete.dialogBody')}</AlertDialogDescription>
        </AlertDialogHeader>
        <Field data-invalid={!!errors.password}>
          <FieldLabel htmlFor="delete-account-password">{t('settings.delete.password')}</FieldLabel>
          <Input
            id="delete-account-password"
            type="password"
            autoComplete="current-password"
            aria-invalid={!!errors.password}
            {...form.register('password')}
          />
          <FormFieldError error={errors.password} />
        </Field>
        <FormError message={formError} />
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>{t('common.cancel')}</AlertDialogCancel>
          <Button type="submit" variant="destructive" disabled={busy}>
            {t('settings.delete.confirm')}
          </Button>
        </AlertDialogFooter>
      </form>
    </AlertDialogContent>
  );
}
