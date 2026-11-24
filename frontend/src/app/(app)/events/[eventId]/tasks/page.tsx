import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { FormError } from '@/components/form-error';
import { Skeleton } from '@/components/ui/skeleton';
import { EventAiPanel } from '@/features/ai/event-ai-panel';
import { isOrgAdmin } from '@/features/members/permissions';
import { todayInBrussels } from '@/features/tasks/task-rules';
import { TasksView } from '@/features/tasks/tasks-view';
import { getActiveMember, listMembers } from '@/server/auth';
import { getEvent, listEventManagers } from '@/server/events/queries';
import { listLabels } from '@/server/labels/queries';
import { listTasks } from '@/server/tasks/queries';

export const metadata: Metadata = { title: 'Taken' };

export default function EventTasksPage({ params }: PageProps<'/events/[eventId]/tasks'>) {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-3xl bg-card" />}>
      <EventTasks params={params} />
    </Suspense>
  );
}

/**
 * The event's preparation tasks. The backend decides what each person sees (managers: all;
 * members: their own and unassigned ones) and may do; `canManage` only decides which controls show.
 */
async function EventTasks({ params }: Pick<PageProps<'/events/[eventId]/tasks'>, 'params'>) {
  const { eventId } = await params;
  const [event, tasks, labels, me, members, managers, t] = await Promise.all([
    getEvent(eventId),
    listTasks(eventId),
    listLabels(eventId),
    getActiveMember(),
    listMembers(),
    listEventManagers(eventId),
    getTranslations(),
  ]);
  const canManage = isOrgAdmin(me.role) || managers.some((manager) => manager.userId === me.userId);
  const readOnly = event.status === 'archived';

  return (
    <div className="flex flex-col gap-4">
      {readOnly && <FormError message={t('tasks.readOnly')} />}
      {canManage && !readOnly && (
        <Suspense fallback={null}>
          <EventAiPanel eventId={event.id} variant="bar" />
        </Suspense>
      )}
      <TasksView
        tasks={tasks}
        mode="event"
        event={{ id: event.id, endsAt: event.endsAt }}
        userId={me.userId}
        canManage={canManage}
        readOnly={readOnly}
        today={todayInBrussels()}
        labels={labels}
        members={members
          .map((member) => ({ userId: member.user.id, name: member.user.name }))
          .sort((a, b) => a.name.localeCompare(b.name, 'nl'))}
      />
    </div>
  );
}
