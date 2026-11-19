import 'server-only';
import {
  aiEventControllerState,
  aiOrganizationControllerListMemory,
  aiOrganizationControllerUsageSummary,
} from '@/api/generated';
import { query } from '../query';

/** The agent's state on an event: runs and pending suggestions. Managers only. */
export const getAiState = (eventId: string) => query(aiEventControllerState({ path: { eventId } }));

/** Everything the agent remembers about the organization. Owners and admins. */
export const listAiMemory = () => query(aiOrganizationControllerListMemory());

/** This month's AI spend and the cap. Owners only. */
export const getAiUsage = () => query(aiOrganizationControllerUsageSummary());
