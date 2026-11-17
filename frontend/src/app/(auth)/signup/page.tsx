import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SignupForm } from '@/features/auth/signup-form';

export const metadata: Metadata = { title: 'Account aanmaken' };

export default function Page() {
  // The form reads the query string, which is only known at request time.
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  );
}
