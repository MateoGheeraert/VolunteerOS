import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { EmailSettings } from '@/features/settings/email-settings';
import { PasswordForm } from '@/features/settings/password-form';
import { getMyProfile } from '@/server/profile/queries';

export const metadata: Metadata = { title: 'Account' };

export default function AccountPage() {
  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <Suspense fallback={<Skeleton className="h-64 rounded-card bg-card" />}>
        <Email />
      </Suspense>
      <PasswordForm />
    </div>
  );
}

async function Email() {
  const { email, emailVerified } = await getMyProfile();
  return <EmailSettings email={email} verified={emailVerified} />;
}
