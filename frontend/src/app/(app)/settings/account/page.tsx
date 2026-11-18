import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { DeleteAccount } from '@/features/settings/delete-account';
import { EmailSettings } from '@/features/settings/email-settings';
import { getDeletionCheck } from '@/server/account/queries';
import { PasswordForm } from '@/features/settings/password-form';
import { getMyProfile } from '@/server/profile/queries';

export const metadata: Metadata = { title: 'Account' };

export default function AccountPage() {
  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <Suspense fallback={<Skeleton className="h-64 rounded-3xl bg-card" />}>
        <Email />
      </Suspense>
      <PasswordForm />
      <Suspense fallback={<Skeleton className="h-48 rounded-3xl bg-card" />}>
        <Deletion />
      </Suspense>
    </div>
  );
}

async function Deletion() {
  return <DeleteAccount check={await getDeletionCheck()} />;
}

async function Email() {
  const { email, emailVerified } = await getMyProfile();
  return <EmailSettings email={email} verified={emailVerified} />;
}
