import { isOrgAdmin } from '@/features/members/permissions';
import { todayInBrussels } from '@/features/tasks/task-rules';
import { getActiveMember, listMembers } from '@/server/auth';
import { getAiState } from '@/server/ai/queries';
import { getEvent, listEventManagers } from '@/server/events/queries';
import { listLabels } from '@/server/labels/queries';
import { AiPanel } from './ai-panel';
import { TaskMilaBar } from './task-mila-bar';

/**
 * Mila for an event, shown only to the people who may act on what she proposes: owners, admins
 * and the event's managers (the same people who manage its tasks). `panel` on the overview,
 * `bar` above the task board.
 */
export async function EventAiPanel({
  eventId,
  variant = 'panel',
}: {
  eventId: string;
  variant?: 'panel' | 'bar';
}) {
  const [event, me, managers] = await Promise.all([
    getEvent(eventId),
    getActiveMember(),
    listEventManagers(eventId),
  ]);
  const canManage = isOrgAdmin(me.role) || managers.some((manager) => manager.userId === me.userId);
  if (!canManage) return null;

  const [state, labels, members] = await Promise.all([
    getAiState(eventId),
    listLabels(eventId),
    listMembers(),
  ]);
  const View = variant === 'bar' ? TaskMilaBar : AiPanel;
  return (
    <View
      state={state}
      tasks={{
        mode: 'event',
        event: { id: event.id, endsAt: event.endsAt },
        userId: me.userId,
        canManage,
        readOnly: event.status === 'archived',
        today: todayInBrussels(),
        labels,
        members: members
          .map((member) => ({ userId: member.user.id, name: member.user.name }))
          .sort((a, b) => a.name.localeCompare(b.name, 'nl')),
      }}
    />
  );
}
