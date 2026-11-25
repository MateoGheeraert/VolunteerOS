import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { FormError } from '@/components/form-error';
import { Skeleton } from '@/components/ui/skeleton';
import { PlanningWithMila } from '@/features/ai/planning/planning-mila-bar';
import { isOrgAdmin } from '@/features/members/permissions';
import { PlanningBoard } from '@/features/planning/planning-board';
import { getActiveMember } from '@/server/auth';
import { getAiState } from '@/server/ai/queries';
import { getEvent, listEventManagers } from '@/server/events/queries';
import { getPlanning, listPlanningRules } from '@/server/planning/queries';

export const metadata: Metadata = { title: 'Planning' };

export default function EventPlanningPage({ params }: PageProps<'/events/[eventId]/planning'>) {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-card bg-card" />}>
      <EventPlanning params={params} />
    </Suspense>
  );
}

/**
 * Teams, shifts and volunteers of the event. Everyone in the organization sees the board; only
 * admins and the event's managers change it (the backend enforces that, `canManage` only decides
 * which controls show). They also get Mila above the board (docs/info.md §7.7.1).
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
  const [state, rules] = canManage
    ? await Promise.all([getAiState(eventId), listPlanningRules(eventId)])
    : [null, []];

  return (
    <div className="flex flex-col gap-4">
      {readOnly && <FormError message={t('planning.readOnly')} />}
      {state?.enabled ? (
        <PlanningWithMila
          event={event}
          planning={planning}
          state={state}
          rules={rules}
          canManage={canManage}
          readOnly={readOnly}
        />
      ) : (
        <PlanningBoard
          event={event}
          planning={planning}
          canManage={canManage}
          readOnly={readOnly}
        />
      )}
    </div>
  );
}
