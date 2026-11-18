import type { Metadata } from 'next';
import { Suspense } from 'react';
import { VerifyEmail } from '@/features/auth/verify-email';

export const metadata: Metadata = { title: 'E-mailadres bevestigen' };

export default function Page() {
  // The token is in the query string, which is only known at request time.
  return (
    <Suspense>
      <VerifyEmail />
    </Suspense>
  );
}
