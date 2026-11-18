'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { MailCheck, Send } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { FormError, FormFieldError } from '@/components/form-error';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { authClient } from '@/lib/auth-client';
import { accountErrorKey } from './account-errors';
import { changeEmailSchema } from './schemas';

/**
 * The account's email: whether it is verified (resend the link if not), and changing it. A change
 * only happens once the link sent to the new address is opened; until then the old one stays.
 */
export function EmailSettings({ email, verified }: { email: string; verified: boolean }) {
  const t = useTranslations();
  const [resending, setResending] = useState(false);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm({
    resolver: zodResolver(changeEmailSchema),
    defaultValues: { newEmail: '' },
  });

  async function resend() {
    setResending(true);
    const { error } = await authClient.sendVerificationEmail({ email });
    setResending(false);
    if (error) {
      toast.error(t(accountErrorKey(error)));
      return;
    }
    toast.success(t('settings.account.verificationSent', { email }));
  }

  const onSubmit = form.handleSubmit(async ({ newEmail }) => {
    setFormError(null);
    if (newEmail.toLowerCase() === email.toLowerCase()) {
      form.setError('newEmail', { message: 'settings.account.sameEmail' });
      return;
    }
    const { error } = await authClient.changeEmail({ newEmail });
    if (error) {
      setFormError(accountErrorKey(error));
      return;
    }
    setPendingEmail(newEmail);
    form.reset();
  });

  return (
    <section className="flex flex-col gap-5 rounded-3xl bg-card p-5 shadow-soft sm:p-8">
      <h2 className="text-lg">{t('settings.account.emailTitle')}</h2>
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-bold break-all">{email}</span>
        {verified ? (
          <Badge variant="ok">{t('settings.account.verified')}</Badge>
        ) : (
          <Badge variant="warn">{t('settings.account.unverified')}</Badge>
        )}
      </div>
      {!verified && (
        <div className="flex flex-col items-start gap-3 rounded-2xl bg-status-warn-bg p-4 text-sm">
          <p>{t('settings.account.unverifiedBody')}</p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={resending}
            onClick={() => void resend()}
          >
            <Send aria-hidden />
            {t('settings.account.resend')}
          </Button>
        </div>
      )}

      {pendingEmail && (
        <output className="flex items-start gap-2 rounded-2xl bg-brand-tint p-4 text-sm font-semibold">
          <MailCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          {t('settings.account.changeSent', { email: pendingEmail })}
        </output>
      )}

      <form onSubmit={(event) => void onSubmit(event)} noValidate className="flex flex-col gap-4">
        <Field data-invalid={!!form.formState.errors.newEmail}>
          <FieldLabel htmlFor="new-email">{t('settings.account.newEmail')}</FieldLabel>
          <Input
            id="new-email"
            type="email"
            autoComplete="email"
            aria-invalid={!!form.formState.errors.newEmail}
            {...form.register('newEmail')}
          />
          <FieldDescription>{t('settings.account.newEmailHint')}</FieldDescription>
          <FormFieldError error={form.formState.errors.newEmail} />
        </Field>
        <FormError message={formError} />
        <div>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {t('settings.account.changeEmail')}
          </Button>
        </div>
      </form>
    </section>
  );
}
