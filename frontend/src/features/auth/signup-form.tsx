'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { FormError, FormFieldError } from '@/components/form-error';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { signupSchema } from '@/features/auth/schemas';
import { authClient } from '@/lib/auth-client';
import { safeNextPath } from '@/lib/navigation';
import { authErrorKey } from './auth-errors';

export function SignupForm() {
  const t = useTranslations();
  const router = useRouter();
  const next = useSearchParams().get('next');
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm({
    resolver: zodResolver(signupSchema),
    defaultValues: { name: '', email: '', password: '' },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    const { error } = await authClient.signUp.email(values);
    const key = authErrorKey(error);
    if (key) {
      setFormError(t(key));
      return;
    }
    // Someone signing up from an invitation goes back to it; everyone else creates an organization.
    router.push(safeNextPath(next, '/onboarding'));
    router.refresh();
  });

  const loginHref = next ? `/login?next=${encodeURIComponent(next)}` : '/login';

  return (
    <form onSubmit={(event) => void onSubmit(event)} noValidate className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl">{t('auth.signupTitle')}</h1>
        <p className="text-muted-foreground">{t('auth.signupSubtitle')}</p>
      </div>
      <FieldGroup className="gap-5">
        <Field data-invalid={!!errors.name}>
          <FieldLabel htmlFor="name">{t('auth.name')}</FieldLabel>
          <Input
            id="name"
            autoComplete="name"
            aria-invalid={!!errors.name}
            {...form.register('name')}
          />
          <FormFieldError error={errors.name} />
        </Field>
        <Field data-invalid={!!errors.email}>
          <FieldLabel htmlFor="email">{t('auth.email')}</FieldLabel>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            aria-invalid={!!errors.email}
            {...form.register('email')}
          />
          <FormFieldError error={errors.email} />
        </Field>
        <Field data-invalid={!!errors.password}>
          <FieldLabel htmlFor="password">{t('auth.password')}</FieldLabel>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            aria-invalid={!!errors.password}
            {...form.register('password')}
          />
          {errors.password ? (
            <FormFieldError error={errors.password} />
          ) : (
            <FieldDescription>{t('auth.passwordHint')}</FieldDescription>
          )}
        </Field>
      </FieldGroup>
      <FormError message={formError} />
      <Button type="submit" size="lg" disabled={form.formState.isSubmitting}>
        {t('auth.signupButton')}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        {t('auth.hasAccount')}{' '}
        <Link href={loginHref} className="font-bold text-primary hover:underline">
          {t('auth.loginLink')}
        </Link>
      </p>
    </form>
  );
}
