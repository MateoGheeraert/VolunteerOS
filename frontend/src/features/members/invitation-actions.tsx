'use client';

import { RotateCw, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth-client';
import { memberErrorMessage } from './member-errors';
import type { AssignableRole } from './permissions';

/**
 * Resend and revoke for one pending invitation. Resending invites the same email again: the
 * backend cancels the old invitation, so only the newest link works, valid for another 7 days.
 */
export function InvitationActions({
  invitationId,
  email,
  role,
}: {
  invitationId: string;
  email: string;
  role: AssignableRole;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function run(request: () => Promise<{ error: { code?: string } | null }>, success: string) {
    setBusy(true);
    const { error } = await request();
    setBusy(false);
    if (error) {
      toast.error(t(memberErrorMessage(error)));
      return;
    }
    toast.success(success);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        size="sm"
        variant="secondary"
        disabled={busy}
        onClick={() =>
          void run(
            () => authClient.organization.inviteMember({ email, role }),
            t('members.invitations.resent', { email }),
          )
        }
      >
        <RotateCw aria-hidden />
        {t('members.invitations.resend')}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={busy}
        onClick={() =>
          void run(
            () => authClient.organization.cancelInvitation({ invitationId }),
            t('members.invitations.revoked', { email }),
          )
        }
      >
        <X aria-hidden />
        {t('members.invitations.revoke')}
      </Button>
    </div>
  );
}
