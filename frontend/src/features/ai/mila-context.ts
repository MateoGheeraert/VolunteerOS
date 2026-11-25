import 'server-only';
import { connection } from 'next/server';
import type { AiEventState } from '@/api/generated/types.gen';
import type { TasksContextValue } from '@/features/tasks/tasks-context';
import { todayInBrussels } from '@/features/tasks/task-rules';
import { getActiveMember, listMembers } from '@/server/auth';
import { getAiState } from '@/server/ai/queries';
import { canManageEvent, getEvent } from '@/server/events/queries';
import { listLabels } from '@/server/labels/queries';

export type MilaTasksContext = TasksContextValue & { event: { id: string; endsAt: string } };

/**
 * What Mila needs on an event page: her state (runs and pending suggestions) and the task context
 * her helpers create tasks with. Null for people who may not act on what she proposes: she only
 * shows for owners, admins and the event's managers (the same people who manage its tasks).
 */
export async function getMilaContext(
  eventId: string,
): Promise<{ state: AiEventState; tasks: MilaTasksContext } | null> {
  const [event, me, canManage] = await Promise.all([
    getEvent(eventId),
    getActiveMember(),
    canManageEvent(eventId),
  ]);
  if (!canManage) return null;

  const [state, labels, members] = await Promise.all([
    getAiState(eventId),
    listLabels(eventId),
    listMembers(),
  ]);
  // "Today" belongs to the request: tell Next.js before reading the clock.
  await connection();
  return {
    state,
    tasks: {
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
    },
  };
}
