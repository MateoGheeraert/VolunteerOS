import type { EventOverview } from '@/api/generated/types.gen';

export type { EventOverview };
export type CardStatus = EventOverview['tasks']['status'];
export type MilaHint = EventOverview['mila']['hints'][number];

/** What every overview card is drawn from. */
export interface OverviewCardProps {
  eventId: string;
  overview: EventOverview;
  canManage: boolean;
  className?: string;
}

/** Filled places split into confirmed, proposed and still open, for a bar or a chart. */
export const coverageParts = (c: { positions: number; filled: number; confirmed: number }) => ({
  confirmed: c.confirmed,
  proposed: c.filled - c.confirmed,
  open: Math.max(0, c.positions - c.filled),
});

/** The hint Mila has for one card, if any. */
export const hintFor = (overview: EventOverview, card: MilaHint['card']) =>
  overview.mila.hints.find((hint) => hint.card === card) ?? null;
