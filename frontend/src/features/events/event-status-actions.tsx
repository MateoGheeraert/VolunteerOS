'use client';

import { useAction } from 'next-safe-action/hooks';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { Event } from '@/api/generated/types.gen';
import { Button } from '@/components/ui/button';
import { changeEventStatus } from '@/server/events/actions';
import type { ChangeableStatus } from './schemas';

/** The status changes the backend allows from each status (backend/src/features/events/event-status.ts). */
const ACTIONS: Record<
  Event['status'],
  {
    to: ChangeableStatus;
    label: 'publish' | 'unpublish' | 'complete' | 'reopen';
    primary?: boolean;
  }[]
> = {
  draft: [{ to: 'published', label: 'publish', primary: true }],
  published: [
    { to: 'completed', label: 'complete' },
    { to: 'draft', label: 'unpublish' },
  ],
  completed: [{ to: 'published', label: 'reopen' }],
  archived: [],
};

export function EventStatusActions({
  eventId,
  status,
}: {
  eventId: string;
  status: Event['status'];
}) {
  const t = useTranslations();
  const router = useRouter();
  const { execute, isPending } = useAction(changeEventStatus.bind(null, eventId), {
    onSuccess: () => {
      toast.success(t('events.statusChanged'));
      router.refresh();
    },
    onError: ({ error }) => toast.error(t(error.serverError?.message ?? 'common.genericError')),
  });

  return (
    <div className="flex flex-wrap gap-2">
      {ACTIONS[status].map((action) => (
        <Button
          key={action.to}
          variant={action.primary ? 'default' : 'secondary'}
          disabled={isPending}
          onClick={() => execute({ status: action.to })}
        >
          {t(`eventOverview.${action.label}`)}
        </Button>
      ))}
    </div>
  );
}
