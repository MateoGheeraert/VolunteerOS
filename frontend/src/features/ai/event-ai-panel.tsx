import { getMilaContext } from './mila-context';
import { TaskMilaBar } from './task-mila-bar';

/**
 * Mila in one line above the task board, for the people who may act on what she proposes. On the
 * overview she lives in the cards and in "Vraag Mila" instead (features/overview).
 */
export async function EventAiPanel({ eventId }: { eventId: string }) {
  const mila = await getMilaContext(eventId);
  if (!mila) return null;
  return <TaskMilaBar state={mila.state} tasks={mila.tasks} />;
}
