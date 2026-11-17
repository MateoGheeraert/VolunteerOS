'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { FormError, FormFieldError } from '@/components/form-error';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { resetPasswordSchema } from '@/features/auth/schemas';
import { authClient } from '@/lib/auth-client';
import { authErrorKey } from './auth-errors';

export function ResetPasswordForm() {
  const t = useTranslations();
  const router = useRouter();
  const token = useSearchParams().get('token');
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { newPassword: '' },
  });

  const onSubmit = form.handleSubmit(async ({ newPassword }) => {
    if (!token) return;
    setFormError(null);
    const { error } = await authClient.resetPassword({ newPassword, token });
    const key = error?.status === 400 ? 'auth.resetInvalid' : authErrorKey(error);
    if (key) {
      setFormError(t(key));
      return;
    }
    toast.success(t('auth.resetDone'));
    router.push('/login');
  });

  if (!token) {
    return (
      <div className="flex flex-col gap-5">
        <FormError message={t('auth.resetInvalid')} />
        <Button asChild variant="secondary">
          <Link href="/forgot-password">{t('auth.forgotButton')}</Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)} noValidate className="flex flex-col gap-6">
      <h1 className="text-2xl">{t('auth.resetTitle')}</h1>
      <Field data-invalid={!!form.formState.errors.newPassword}>
        <FieldLabel htmlFor="newPassword">{t('auth.newPassword')}</FieldLabel>
        <Input
          id="newPassword"
          type="password"
          autoComplete="new-password"
          aria-invalid={!!form.formState.errors.newPassword}
          {...form.register('newPassword')}
        />
        <FormFieldError error={form.formState.errors.newPassword} />
      </Field>
      <FormError message={formError} />
      {formError === t('auth.resetInvalid') && (
        <Link href="/forgot-password" className="text-sm font-bold text-primary hover:underline">
          {t('auth.forgotButton')}
        </Link>
      )}
      <Button type="submit" size="lg" disabled={form.formState.isSubmitting}>
        {t('auth.resetButton')}
      </Button>
    </form>
  );
}
