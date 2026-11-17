import { ShieldX } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { StatusPage } from '@/components/layout/status-page';
import { Button } from '@/components/ui/button';

export default async function Forbidden() {
  const t = await getTranslations('errorPages');
  return (
    <StatusPage icon={ShieldX} tone="warn" title={t('forbiddenTitle')} body={t('forbiddenBody')}>
      <Button asChild>
        <Link href="/events">{t('home')}</Link>
      </Button>
    </StatusPage>
  );
}
