import type { EventStatus } from '../../db/schema/index.js';

/**
 * Allowed status changes through PATCH. Archiving has its own endpoint, and an archived
 * event is read-only (terminal) so its history stays as it was.
 */
const transitions: Record<EventStatus, readonly EventStatus[]> = {
  draft: ['published'],
  published: ['draft', 'completed'],
  completed: ['published'],
  archived: [],
};

export const canTransition = (from: EventStatus, to: EventStatus) =>
  from === to || transitions[from].includes(to);

export const canArchive = (from: EventStatus) => from !== 'archived';

export const isReadOnly = (status: EventStatus) => status === 'archived';
