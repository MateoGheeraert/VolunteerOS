'use client';

import { CircleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { StatusPage } from '@/components/layout/status-page';
import { Button } from '@/components/ui/button';

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('errorPages');
  return (
    <StatusPage icon={CircleAlert} tone="bad" title={t('errorTitle')} body={t('errorBody')}>
      <Button onClick={reset}>{t('retry')}</Button>
    </StatusPage>
  );
}
