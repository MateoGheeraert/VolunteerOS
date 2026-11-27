import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { FormError } from '@/components/form-error';
import { Skeleton } from '@/components/ui/skeleton';
import { BudgetMilaBar, ProposedBudgetRows } from '@/features/budget/budget-mila';
import { BudgetView } from '@/features/budget/budget-view';
import { isOrgAdmin } from '@/features/members/permissions';
import { getAiState } from '@/server/ai/queries';
import { getActiveMember } from '@/server/auth';
import { listBudgetEntries } from '@/server/budget/queries';
import { getEvent, listEventManagers } from '@/server/events/queries';
import { listLabels } from '@/server/labels/queries';
import { listSuppliers } from '@/server/suppliers/queries';
import { listTasks } from '@/server/tasks/queries';

export const metadata: Metadata = { title: 'Budget' };

export default function EventBudgetPage({
  params,
  searchParams,
}: PageProps<'/events/[eventId]/budget'>) {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-card bg-card" />}>
      <EventBudget params={params} searchParams={searchParams} />
    </Suspense>
  );
}

/**
 * The event's budget: expected and actual income and expenses. Every member reads it; managers
 * change it. `canManage` only decides which controls show; the backend enforces it.
 */
async function EventBudget({
  params,
  searchParams,
}: Pick<PageProps<'/events/[eventId]/budget'>, 'params' | 'searchParams'>) {
  const { eventId } = await params;
  // `?entry=` opens that entry, e.g. from a supplier's page; `?mila=voorstellen` scrolls to Mila's
  // proposed lines in the table, from her hint on the overview.
  const { entry: openEntry, mila: openMila } = await searchParams;
  const [event, entries, labels, me, managers, t] = await Promise.all([
    getEvent(eventId),
    listBudgetEntries(eventId),
    listLabels(eventId),
    getActiveMember(),
    listEventManagers(eventId),
    getTranslations(),
  ]);
  const canManage = isOrgAdmin(me.role) || managers.some((manager) => manager.userId === me.userId);
  const readOnly = event.status === 'archived';
  // Only managers link entries to tasks, and they see every task of the event. Mila's proposals
  // are for them too.
  const [tasks, suppliers, mila] =
    canManage && !readOnly
      ? await Promise.all([listTasks(eventId), listSuppliers(), getAiState(eventId)])
      : [[], [], null];
  const taskOptions = tasks
    .map((task) => ({ id: task.id, title: task.title }))
    .sort((a, b) => a.title.localeCompare(b.title, 'nl'));
  const supplierOptions = suppliers.map((supplier) => ({
    id: supplier.id,
    name: supplier.name,
    archived: supplier.archivedAt !== null,
  }));

  return (
    <div className="flex flex-col gap-4">
      {readOnly && <FormError message={t('budget.readOnly')} />}
      {mila?.enabled && (
        <BudgetMilaBar
          eventId={event.id}
          state={mila}
          entryCount={entries.length}
          labels={labels}
          tasks={taskOptions}
          suppliers={supplierOptions}
        />
      )}
      <BudgetView
        eventId={event.id}
        entries={entries}
        labels={labels}
        tasks={taskOptions}
        suppliers={supplierOptions}
        initialOpenId={typeof openEntry === 'string' ? openEntry : undefined}
        canManage={canManage}
        readOnly={readOnly}
        milaRows={
          mila?.enabled && (
            <ProposedBudgetRows
              eventId={event.id}
              state={mila}
              labels={labels}
              tasks={taskOptions}
              suppliers={supplierOptions}
              scrollToFirst={openMila === 'voorstellen'}
            />
          )
        }
      />
    </div>
  );
}
