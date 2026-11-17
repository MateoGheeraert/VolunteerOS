import { SearchX } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { StatusPage } from '@/components/layout/status-page';
import { Button } from '@/components/ui/button';

export default async function NotFound() {
  const t = await getTranslations('errorPages');
  return (
    <StatusPage icon={SearchX} title={t('notFoundTitle')} body={t('notFoundBody')}>
      <Button asChild>
        <Link href="/events">{t('home')}</Link>
      </Button>
    </StatusPage>
  );
}
