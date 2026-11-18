import { HeartHandshake } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { IconBlob } from '@/components/layout/icon-blob';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Account verwijderd' };

/** Where the app lands after deleting your account; public, as the session is gone. */
export default async function AccountDeletedPage() {
  const t = await getTranslations();
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <IconBlob icon={HeartHandshake} size="lg" />
      <h1 className="text-2xl">{t('accountDeleted.title')}</h1>
      <p className="text-muted-foreground">{t('accountDeleted.body')}</p>
      <div className="flex w-full flex-col gap-2">
        <Button asChild size="lg" className="w-full">
          <Link href="/login">{t('accountDeleted.login')}</Link>
        </Button>
        <Button asChild size="lg" variant="ghost" className="w-full">
          <Link href="/signup">{t('accountDeleted.signup')}</Link>
        </Button>
      </div>
    </div>
  );
}
