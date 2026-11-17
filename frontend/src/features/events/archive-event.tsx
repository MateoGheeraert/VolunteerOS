'use client';

import { Archive } from 'lucide-react';
import { useAction } from 'next-safe-action/hooks';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { archiveEvent } from '@/server/events/actions';

/** Two clicks on purpose: archiving can't be undone. */
export function ArchiveEvent({ eventId }: { eventId: string }) {
  const t = useTranslations();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const { execute, isPending } = useAction(archiveEvent.bind(null, eventId), {
    onSuccess: () => {
      toast.success(t('events.archived'));
      router.push('/events');
    },
    onError: ({ error }) => toast.error(t(error.serverError?.message ?? 'common.genericError')),
  });

  return (
    <section className="flex flex-col gap-3 rounded-3xl bg-card p-5 shadow-soft sm:p-6">
      <h2 className="text-lg">{t('eventForm.archiveTitle')}</h2>
      <p className="text-muted-foreground">{t('eventForm.archiveBody')}</p>
      <div className="flex flex-wrap gap-2">
        {confirming ? (
          <>
            <Button variant="destructive" onClick={() => execute()} disabled={isPending}>
              <Archive aria-hidden />
              {t('eventForm.archiveConfirm')}
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)} disabled={isPending}>
              {t('common.cancel')}
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={() => setConfirming(true)}>
            <Archive aria-hidden />
            {t('eventForm.archiveButton')}
          </Button>
        )}
      </div>
    </section>
  );
}
