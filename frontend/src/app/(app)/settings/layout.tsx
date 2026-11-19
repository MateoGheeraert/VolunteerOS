import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { isOrgAdmin } from '@/features/members/permissions';
import { SettingsTabs } from '@/features/settings/settings-tabs';
import { getActiveMember } from '@/server/auth';

/** Settings: your profile and account, and the active organization's (Organisatie). */
export default async function SettingsLayout({ children }: LayoutProps<'/settings'>) {
  const t = await getTranslations();
  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div className="flex flex-col gap-5">
        <PageHeader title={t('settings.title')} />
        {/* The role comes from the session: the static shell shows the tabs everyone has. */}
        <Suspense fallback={<SettingsTabs isAdmin={false} />}>
          <RoleAwareTabs />
        </Suspense>
      </div>
      {children}
    </div>
  );
}

async function RoleAwareTabs() {
  const me = await getActiveMember();
  return <SettingsTabs isAdmin={isOrgAdmin(me.role)} />;
}
