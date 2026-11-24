import 'server-only';
import { budgetControllerList } from '@/api/generated';
import { query } from '../query';

/** The event's budget entries, income first. */
export const listBudgetEntries = (eventId: string) =>
  query(budgetControllerList({ path: { eventId } }));
