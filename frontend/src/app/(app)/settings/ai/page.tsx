import type { Metadata } from 'next';
import { forbidden } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { MILA_NAME, MilaPanel } from '@/components/mila';
import { Skeleton } from '@/components/ui/skeleton';
import { AiMemoryList } from '@/features/ai/ai-memory-list';
import { isOrgAdmin } from '@/features/members/permissions';
import { getActiveMember } from '@/server/auth';
import { getAiUsage, listAiMemory } from '@/server/ai/queries';

export const metadata: Metadata = { title: 'Mila' };

export default function AiSettingsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-72 rounded-3xl bg-card" />}>
      <AiSettings />
    </Suspense>
  );
}

/** What the agent remembers (owners and admins) and what it cost this month (owners). */
async function AiSettings() {
  const me = await getActiveMember();
  if (!isOrgAdmin(me.role)) forbidden();
  const [memories, usage, t] = await Promise.all([
    listAiMemory(),
    me.role === 'owner' ? getAiUsage() : Promise.resolve(null),
    getTranslations(),
  ]);
  const euros = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');

  return (
    <div className="flex flex-col gap-5">
      {usage && (
        <section className="flex flex-col gap-1 rounded-3xl bg-card p-5 shadow-soft sm:p-6">
          <h2 className="text-lg">{t('ai.usage.title', { name: MILA_NAME })}</h2>
          <p className="text-muted-foreground">
            {t('ai.usage.body', {
              spent: euros(usage.monthToDateCents),
              cap: euros(usage.capCents),
            })}
          </p>
        </section>
      )}
      <MilaPanel title={t('ai.memory.title', { name: MILA_NAME })} subtitle={t('ai.memory.intro')}>
        <AiMemoryList memories={memories} />
      </MilaPanel>
    </div>
  );
}
