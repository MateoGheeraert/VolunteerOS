'use client';

import { useAction } from 'next-safe-action/hooks';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import type { ComponentProps, ReactNode } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { changeEventStatus } from '@/server/events/actions';
import type { ChangeableStatus } from './schemas';

/**
 * Moves an event to another status. Which moves are allowed lives in the backend
 * (backend/src/features/events/event-status.ts); callers only show the ones that apply.
 */
export function EventStatusButton({
  eventId,
  to,
  variant = 'secondary',
  children,
}: {
  eventId: string;
  to: ChangeableStatus;
  variant?: ComponentProps<typeof Button>['variant'];
  children: ReactNode;
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
    <Button variant={variant} disabled={isPending} onClick={() => execute({ status: to })}>
      {children}
    </Button>
  );
}
