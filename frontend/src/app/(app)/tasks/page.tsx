import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { todayInBrussels } from '@/features/tasks/task-rules';
import { TasksView } from '@/features/tasks/tasks-view';
import { getActiveMember } from '@/server/auth';
import { listMyTasks } from '@/server/tasks/queries';

export const metadata: Metadata = { title: 'Mijn taken' };

export default async function MyTasksPage() {
  const t = await getTranslations();
  return (
    <>
      <PageHeader title={t('myTasks.title')} description={t('myTasks.description')} />
      <Suspense fallback={<Skeleton className="h-96 rounded-3xl bg-card" />}>
        <MyTasks />
      </Suspense>
    </>
  );
}

/**
 * The signed-in user's tasks across every event that isn't archived. They are all theirs, so they
 * can move them and give them back; planning (editing, labels, requests) stays on the event page.
 */
async function MyTasks() {
  const [{ tasks, labels }, me] = await Promise.all([listMyTasks(), getActiveMember()]);
  return (
    <TasksView
      tasks={tasks}
      mode="mine"
      event={null}
      userId={me.userId}
      canManage={false}
      readOnly={false}
      today={todayInBrussels()}
      labels={labels}
      members={[]}
    />
  );
}
