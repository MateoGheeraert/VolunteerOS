import type { Metadata } from 'next';
import { Suspense } from 'react';
import { requireSession } from '@/server/auth';
import { Skeleton } from '@/components/ui/skeleton';
import { CreateOrganizationForm } from '@/features/organizations/create-organization-form';

export const metadata: Metadata = { title: 'Je organisatie' };

export default function OnboardingPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full rounded-card" />}>
      <Onboarding />
    </Suspense>
  );
}

async function Onboarding() {
  await requireSession();
  return <CreateOrganizationForm />;
}
