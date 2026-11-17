'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { FormError, FormFieldError } from '@/components/form-error';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { loginSchema } from '@/features/auth/schemas';
import { authClient } from '@/lib/auth-client';
import { safeNextPath } from '@/lib/navigation';
import { authErrorKey } from './auth-errors';

export function LoginForm() {
  const t = useTranslations();
  const router = useRouter();
  const next = useSearchParams().get('next');
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    const { error } = await authClient.signIn.email(values);
    const key = authErrorKey(error);
    if (key) {
      setFormError(t(key));
      return;
    }
    router.push(safeNextPath(next));
    router.refresh();
  });

  const signupHref = next ? `/signup?next=${encodeURIComponent(next)}` : '/signup';

  return (
    <form onSubmit={(event) => void onSubmit(event)} noValidate className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl">{t('auth.loginTitle')}</h1>
        <p className="text-muted-foreground">{t('auth.loginSubtitle')}</p>
      </div>
      <FieldGroup className="gap-5">
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
        <Field data-invalid={!!form.formState.errors.password}>
          <div className="flex items-center justify-between gap-2">
            <FieldLabel htmlFor="password">{t('auth.password')}</FieldLabel>
            <Link
              href="/forgot-password"
              className="text-sm font-semibold text-primary hover:underline"
            >
              {t('auth.forgotLink')}
            </Link>
          </div>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            aria-invalid={!!form.formState.errors.password}
            {...form.register('password')}
          />
          <FormFieldError error={form.formState.errors.password} />
        </Field>
      </FieldGroup>
      <FormError message={formError} />
      <Button type="submit" size="lg" disabled={form.formState.isSubmitting}>
        {t('auth.loginButton')}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        {t('auth.noAccount')}{' '}
        <Link href={signupHref} className="font-bold text-primary hover:underline">
          {t('auth.signupLink')}
        </Link>
      </p>
    </form>
  );
}
