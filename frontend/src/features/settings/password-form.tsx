'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { FormError, FormFieldError } from '@/components/form-error';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { authClient } from '@/lib/auth-client';
import { accountErrorKey } from './account-errors';
import { changePasswordSchema } from './schemas';

/** Changing the password needs the current one. Other devices are signed out unless unticked. */
export function PasswordForm() {
  const t = useTranslations();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '', revokeOtherSessions: true },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    const { error } = await authClient.changePassword(values);
    if (error) {
      if (error.code === 'INVALID_PASSWORD') {
        form.setError('currentPassword', { message: 'settings.account.wrongPassword' });
      } else {
        setFormError(accountErrorKey(error));
      }
      return;
    }
    toast.success(t('settings.account.passwordChanged'));
    form.reset();
  });

  return (
    <section className="flex flex-col gap-5 rounded-3xl bg-card p-5 shadow-soft sm:p-8">
      <h2 className="text-lg">{t('settings.account.passwordTitle')}</h2>
      <form onSubmit={(event) => void onSubmit(event)} noValidate className="flex flex-col gap-4">
        <Field data-invalid={!!errors.currentPassword}>
          <FieldLabel htmlFor="current-password">
            {t('settings.account.currentPassword')}
          </FieldLabel>
          <Input
            id="current-password"
            type="password"
            autoComplete="current-password"
            aria-invalid={!!errors.currentPassword}
            {...form.register('currentPassword')}
          />
          <FormFieldError error={errors.currentPassword} />
        </Field>
        <Field data-invalid={!!errors.newPassword}>
          <FieldLabel htmlFor="new-password">{t('auth.newPassword')}</FieldLabel>
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            aria-invalid={!!errors.newPassword}
            {...form.register('newPassword')}
          />
          <FieldDescription>{t('auth.passwordHint')}</FieldDescription>
          <FormFieldError error={errors.newPassword} />
        </Field>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-primary"
            {...form.register('revokeOtherSessions')}
          />
          <span className="flex flex-col gap-0.5">
            <span className="font-semibold">{t('settings.account.revokeOtherSessions')}</span>
            <span className="text-muted-foreground">
              {t('settings.account.revokeOtherSessionsHint')}
            </span>
          </span>
        </label>
        <FormError message={formError} />
        <div>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {t('settings.account.changePassword')}
          </Button>
        </div>
      </form>
    </section>
  );
}
