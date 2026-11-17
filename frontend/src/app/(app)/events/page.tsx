import { Plus } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { Suspense } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { EventList, EventListSkeleton } from '@/features/events/event-list';

export const metadata: Metadata = { title: 'Evenementen' };

export default async function EventsPage() {
  const t = await getTranslations();
  return (
    <>
      <PageHeader
        title={t('events.title')}
        actions={
          <Button asChild>
            <Link href="/events/new">
              <Plus aria-hidden />
              {t('events.new')}
            </Link>
          </Button>
        }
      />
      <Suspense fallback={<EventListSkeleton />}>
        <EventList />
      </Suspense>
    </>
  );
}
