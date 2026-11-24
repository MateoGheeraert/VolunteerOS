import 'server-only';
import { labelsControllerList } from '@/api/generated';
import { query } from '../query';

/** The event's labels, shared by its tasks and budget entries. */
export const listLabels = (eventId: string) => query(labelsControllerList({ path: { eventId } }));
