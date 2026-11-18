'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Send } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { FormError, FormFieldError } from '@/components/form-error';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { authClient } from '@/lib/auth-client';
import { memberErrorMessage } from './member-errors';
import { ASSIGNABLE_ROLES } from './permissions';
import { inviteSchema } from './schemas';

export function InviteMemberForm() {
  const t = useTranslations();
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: '', role: 'member' as const },
  });

  const onSubmit = form.handleSubmit(async ({ email, role }) => {
    setFormError(null);
    const { error } = await authClient.organization.inviteMember({ email, role });
    if (error) {
      setFormError(memberErrorMessage(error));
      return;
    }
    toast.success(t('members.invite.sent', { email }));
    form.reset();
    router.refresh();
  });

  return (
    <form onSubmit={(event) => void onSubmit(event)} noValidate className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
        <Field data-invalid={!!form.formState.errors.email}>
          <FieldLabel htmlFor="invite-email">{t('members.invite.email')}</FieldLabel>
          <Input
            id="invite-email"
            type="email"
            autoComplete="off"
            placeholder={t('members.invite.emailPlaceholder')}
            aria-invalid={!!form.formState.errors.email}
            {...form.register('email')}
          />
          <FormFieldError error={form.formState.errors.email} />
        </Field>
        <Field>
          <FieldLabel htmlFor="invite-role">{t('members.invite.role')}</FieldLabel>
          <NativeSelect id="invite-role" {...form.register('role')}>
            {ASSIGNABLE_ROLES.map((role) => (
              <option key={role} value={role}>
                {t(`members.roles.${role}`)}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <FormError message={formError} />
      <div>
        <Button type="submit" disabled={form.formState.isSubmitting}>
          <Send aria-hidden />
          {t('members.invite.button')}
        </Button>
      </div>
    </form>
  );
}
