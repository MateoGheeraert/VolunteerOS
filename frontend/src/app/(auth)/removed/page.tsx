import { UserX } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { IconBlob } from '@/components/layout/icon-blob';
import { Skeleton } from '@/components/ui/skeleton';
import { SwitchAfterRemoval } from '@/features/organizations/switch-after-removal';
import { listOrganizations, requireSession } from '@/server/auth';

export const metadata: Metadata = { title: 'Geen lid meer' };

/**
 * Where the app sends someone whose active organization removed them. It moves them on to another
 * organization they belong to, or to creating a new one.
 */
export default function RemovedPage() {
  return (
    <Suspense fallback={<Skeleton className="h-56 w-full rounded-2xl" />}>
      <Removed />
    </Suspense>
  );
}

async function Removed() {
  const [session, organizations, t] = await Promise.all([
    requireSession(),
    listOrganizations(),
    getTranslations(),
  ]);
  // Opened directly while still a member of the active organization: nothing to explain.
  if (organizations.some((org) => org.id === session.activeOrganizationId)) redirect('/events');

  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <IconBlob icon={UserX} tone="warn" size="lg" />
      <h1 className="text-2xl">{t('members.removedTitle')}</h1>
      <p className="text-muted-foreground">{t('members.removedNotice')}</p>
      <SwitchAfterRemoval nextOrganizationId={organizations[0]?.id ?? null} />
    </div>
  );
}
