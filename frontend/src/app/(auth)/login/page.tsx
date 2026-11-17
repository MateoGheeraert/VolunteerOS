import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LoginForm } from '@/features/auth/login-form';

export const metadata: Metadata = { title: 'Inloggen' };

export default function Page() {
  // The form reads the query string, which is only known at request time.
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
