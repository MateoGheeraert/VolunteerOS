import 'server-only';
import {
  myTasksControllerListMine,
  taskLabelsControllerList,
  tasksControllerList,
} from '@/api/generated';
import { query } from '../query';

/** The event's tasks the caller may see: all of them for managers, own + unassigned for members. */
export const listTasks = (eventId: string) => query(tasksControllerList({ path: { eventId } }));

export const listTaskLabels = (eventId: string) =>
  query(taskLabelsControllerList({ path: { eventId } }));

/** The caller's tasks across the organization's events, with those events' labels. */
export const listMyTasks = () => query(myTasksControllerListMine());
