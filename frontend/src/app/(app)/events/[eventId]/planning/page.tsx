import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { FormError } from '@/components/form-error';
import { Skeleton } from '@/components/ui/skeleton';
import { isOrgAdmin } from '@/features/members/permissions';
import { PlanningBoard } from '@/features/planning/planning-board';
import { getActiveMember } from '@/server/auth';
import { getEvent, listEventManagers } from '@/server/events/queries';
import { getPlanning } from '@/server/planning/queries';

export const metadata: Metadata = { title: 'Planning' };

export default function EventPlanningPage({ params }: PageProps<'/events/[eventId]/planning'>) {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-3xl bg-card" />}>
      <EventPlanning params={params} />
    </Suspense>
  );
}

/**
 * Teams, shifts and volunteers of the event. Everyone in the organization sees the board; only
 * admins and the event's managers change it (the backend enforces that, `canManage` only decides
 * which controls show).
 */
async function EventPlanning({ params }: Pick<PageProps<'/events/[eventId]/planning'>, 'params'>) {
  const { eventId } = await params;
  const [event, planning, me, managers, t] = await Promise.all([
    getEvent(eventId),
    getPlanning(eventId),
    getActiveMember(),
    listEventManagers(eventId),
    getTranslations(),
  ]);
  const canManage = isOrgAdmin(me.role) || managers.some((manager) => manager.userId === me.userId);
  const readOnly = event.status === 'archived';

  return (
    <div className="flex flex-col gap-4">
      {readOnly && <FormError message={t('planning.readOnly')} />}
      <PlanningBoard event={event} planning={planning} canManage={canManage} readOnly={readOnly} />
    </div>
  );
}
