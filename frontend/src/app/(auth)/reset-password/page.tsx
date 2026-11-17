import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ResetPasswordForm } from '@/features/auth/reset-password-form';

export const metadata: Metadata = { title: 'Nieuw wachtwoord' };

export default function Page() {
  // The form reads the query string, which is only known at request time.
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
