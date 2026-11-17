'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { FormError } from '@/components/form-error';
import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth-client';

export function InvitationActions({
  invitationId,
  organizationId,
  organizationName,
}: {
  invitationId: string;
  organizationId: string;
  organizationName: string;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [declined, setDeclined] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setBusy(true);
    setError(null);
    const { error: acceptError } = await authClient.organization.acceptInvitation({ invitationId });
    if (acceptError) {
      setError(t('invitation.unavailable'));
      setBusy(false);
      return;
    }
    await authClient.organization.setActive({ organizationId });
    toast.success(t('invitation.accepted', { organization: organizationName }));
    router.push('/events');
    router.refresh();
  }

  async function decline() {
    setBusy(true);
    setError(null);
    const { error: rejectError } = await authClient.organization.rejectInvitation({ invitationId });
    setBusy(false);
    if (rejectError) {
      setError(t('common.genericError'));
      return;
    }
    setDeclined(true);
  }

  if (declined) {
    return <p className="font-semibold text-muted-foreground">{t('invitation.declined')}</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <FormError message={error} />
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={() => void decline()} disabled={busy}>
          {t('invitation.decline')}
        </Button>
        <Button onClick={() => void accept()} disabled={busy}>
          {t('invitation.accept')}
        </Button>
      </div>
    </div>
  );
}
