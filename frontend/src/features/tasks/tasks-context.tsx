'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { createContext, use } from 'react';
import { toast } from 'sonner';
import type { Label, Task, TaskEvent } from '@/api/generated/types.gen';
import type { ActionError } from '@/server/action-client';

/** A task as the views show it. On "my tasks", which spans events, it also says which event. */
export type ShownTask = Task & { event?: TaskEvent };

/** What every part of a task page needs to know. */
export interface TasksContextValue {
  /** One event's tasks, or the signed-in user's tasks across events. */
  mode: 'event' | 'mine';
  /** The event, on an event's page. */
  event: { id: string; endsAt: string } | null;
  /** The signed-in user. */
  userId: string;
  /** Org owners and admins, and the event's managers: they plan; members do their own tasks. */
  canManage: boolean;
  /** Archived events: everything is shown, nothing can change. */
  readOnly: boolean;
  /** Today in Brussels, from the server, so server and client agree on what is overdue. */
  today: string;
  labels: Label[];
  /** Current organization members, for the assignee picker. */
  members: { userId: string; name: string }[];
}

const TasksContext = createContext<TasksContextValue | null>(null);
export const TasksProvider = TasksContext.Provider;

export function useTasksContext(): TasksContextValue {
  const value = use(TasksContext);
  if (!value) throw new Error('useTasksContext must be used inside <TasksProvider>');
  return value;
}

/**
 * Callbacks for `useAction`. A success shows itself (the task moves, the pane updates), so it only
 * refreshes the data; only a failure gets a toast.
 */
export function useActionFeedback() {
  const t = useTranslations();
  const router = useRouter();
  return {
    onSuccess: () => router.refresh(),
    onError: ({ error }: { error: { serverError?: ActionError } }) =>
      toast.error(t(error.serverError?.message ?? 'common.genericError')),
  };
}
