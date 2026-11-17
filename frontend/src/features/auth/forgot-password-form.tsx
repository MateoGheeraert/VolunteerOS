'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { MailCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { FormError, FormFieldError } from '@/components/form-error';
import { IconBlob } from '@/components/layout/icon-blob';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { forgotPasswordSchema } from '@/features/auth/schemas';
import { authClient } from '@/lib/auth-client';
import { authErrorKey } from './auth-errors';

export function ForgotPasswordForm() {
  const t = useTranslations();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = form.handleSubmit(async ({ email }) => {
    setFormError(null);
    const { error } = await authClient.requestPasswordReset({
      email,
      redirectTo: '/reset-password',
    });
    // Better Auth answers the same whether or not the account exists, so this reveals nothing.
    const key = authErrorKey(error);
    if (key) {
      setFormError(t(key));
      return;
    }
    setSentTo(email);
  });

  if (sentTo) {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <IconBlob icon={MailCheck} tone="ok" size="lg" />
        <p>{t('auth.forgotSent', { email: sentTo })}</p>
        <Button asChild variant="secondary">
          <Link href="/login">{t('auth.loginLink')}</Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)} noValidate className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl">{t('auth.forgotTitle')}</h1>
        <p className="text-muted-foreground">{t('auth.forgotSubtitle')}</p>
      </div>
      <Field data-invalid={!!form.formState.errors.email}>
        <FieldLabel htmlFor="email">{t('auth.email')}</FieldLabel>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          aria-invalid={!!form.formState.errors.email}
          {...form.register('email')}
        />
        <FormFieldError error={form.formState.errors.email} />
      </Field>
      <FormError message={formError} />
      <Button type="submit" size="lg" disabled={form.formState.isSubmitting}>
        {t('auth.forgotButton')}
      </Button>
      <Link href="/login" className="text-center text-sm font-bold text-primary hover:underline">
        {t('common.back')}
      </Link>
    </form>
  );
}
