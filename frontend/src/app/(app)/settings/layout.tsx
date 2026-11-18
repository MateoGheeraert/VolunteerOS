import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/layout/page-header';
import { SettingsTabs } from '@/components/layout/settings-tabs';

export default async function SettingsLayout({ children }: LayoutProps<'/settings'>) {
  const t = await getTranslations();
  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div className="flex flex-col gap-5">
        <PageHeader title={t('nav.settings')} />
        <SettingsTabs />
      </div>
      {children}
    </div>
  );
}
