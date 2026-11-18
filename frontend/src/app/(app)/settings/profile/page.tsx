import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { ProfileSettings } from '@/features/settings/profile-settings';
import { todayInBrussels } from '@/features/tasks/task-rules';
import { getMyProfile } from '@/server/profile/queries';

export const metadata: Metadata = { title: 'Profiel' };

export default function ProfilePage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 max-w-3xl rounded-3xl bg-card" />}>
      <Profile />
    </Suspense>
  );
}

async function Profile() {
  const profile = await getMyProfile();
  return <ProfileSettings profile={profile} today={todayInBrussels()} />;
}
