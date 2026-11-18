import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/layout/page-header';
import { SettingsTabs } from '@/features/settings/settings-tabs';

/** Settings: your profile and account, and the active organization's (Organisatie). */
export default async function SettingsLayout({ children }: LayoutProps<'/settings'>) {
  const t = await getTranslations();
  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div className="flex flex-col gap-5">
        <PageHeader title={t('settings.title')} />
        <SettingsTabs />
      </div>
      {children}
    </div>
  );
}
