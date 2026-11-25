import 'server-only';
import { promotionControllerState } from '@/api/generated';
import { query } from '../query';

/** The Promotie tab: the Publiek, the Promotie tasks, the pilot metric and Mila's plan. */
export const getPromotionState = (eventId: string) =>
  query(promotionControllerState({ path: { eventId } }));
