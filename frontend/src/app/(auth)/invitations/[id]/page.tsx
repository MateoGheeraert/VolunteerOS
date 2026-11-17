import { MailOpen } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { Suspense } from 'react';
import { getInvitation, getSession } from '@/server/auth';
import { FormError } from '@/components/form-error';
import { IconBlob } from '@/components/layout/icon-blob';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { InvitationActions } from '@/features/organizations/invitation-actions';

export const metadata: Metadata = { title: 'Uitnodiging' };

/** The link in the invitation email (backend/src/auth/auth.ts) points here. */
export default function InvitationPage({ params }: PageProps<'/invitations/[id]'>) {
  return (
    <Suspense fallback={<Skeleton className="h-56 w-full rounded-2xl" />}>
      <Invitation params={params} />
    </Suspense>
  );
}

async function Invitation({ params }: Pick<PageProps<'/invitations/[id]'>, 'params'>) {
  const [{ id }, t, session] = await Promise.all([params, getTranslations(), getSession()]);
  const here = `/invitations/${id}`;

  const header = (
    <div className="flex flex-col items-center gap-3 text-center">
      <IconBlob icon={MailOpen} size="lg" />
      <h1 className="text-2xl">{t('invitation.title')}</h1>
    </div>
  );

  if (!session) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <p className="text-center text-muted-foreground">{t('invitation.loggedOut')}</p>
        <div className="flex flex-col gap-3">
          <Button asChild size="lg">
            <Link href={`/login?next=${encodeURIComponent(here)}`}>{t('auth.loginButton')}</Link>
          </Button>
          <Button asChild size="lg" variant="secondary">
            <Link href={`/signup?next=${encodeURIComponent(here)}`}>{t('auth.signupButton')}</Link>
          </Button>
        </div>
      </div>
    );
  }

  const invitation = await getInvitation(id);
  const usable = invitation?.status === 'pending' && new Date(invitation.expiresAt) > new Date();

  return (
    <div className="flex flex-col gap-6">
      {header}
      {invitation && usable ? (
        <>
          <p className="text-center">
            {t('invitation.body', {
              inviter: invitation.inviterEmail,
              organization: invitation.organizationName,
            })}
          </p>
          <InvitationActions
            invitationId={invitation.id}
            organizationId={invitation.organizationId}
            organizationName={invitation.organizationName}
          />
        </>
      ) : (
        <FormError message={t('invitation.unavailable')} />
      )}
      <p className="text-center text-sm text-muted-foreground">
        {t('invitation.loggedInAs', { email: session.user.email })}
      </p>
    </div>
  );
}
