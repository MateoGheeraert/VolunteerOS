import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ForgotPasswordForm } from '@/features/auth/forgot-password-form';

export const metadata: Metadata = { title: 'Wachtwoord vergeten' };

export default function Page() {
  // The form reads the query string, which is only known at request time.
  return (
    <Suspense>
      <ForgotPasswordForm />
    </Suspense>
  );
}
