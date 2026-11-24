import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { isOrgAdmin } from '@/features/members/permissions';
import { OrganizationProfileView } from '@/features/organizations/organization-profile';
import { getActiveMember, getActiveOrganizationProfile } from '@/server/auth';

export const metadata: Metadata = { title: 'Organisatie' };

export default function OrganizationSettingsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-card bg-card" />}>
      <OrganizationSettings />
    </Suspense>
  );
}

/** Every member sees the profile; owners and admins edit it (Better Auth enforces the same). */
async function OrganizationSettings() {
  const [profile, me] = await Promise.all([getActiveOrganizationProfile(), getActiveMember()]);
  // key: fresh fields when another organization becomes active
  return (
    <OrganizationProfileView key={profile.id} profile={profile} editable={isOrgAdmin(me.role)} />
  );
}
