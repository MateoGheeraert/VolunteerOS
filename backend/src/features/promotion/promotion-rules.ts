import type { LabelColor, PromotionAudience } from '../../db/schema/index.js';
import { isReadOnly } from '../events/event-status.js';
import { todayInBrussels } from '../profile/profile-rules.js';

/**
 * Pure rules for the Promotie tab and Mila's promotion plan (docs/info.md §7.11). No database, so
 * they are unit-tested on their own; the runner, the tab and the overview share them.
 */

/** The label every promotion task and budget line carries; created on the first accepted action. */
export const PROMOTION_LABEL = { name: 'Promotie', color: 'purple' } as const satisfies {
  name: string;
  color: LabelColor;
};

export const isPromotionLabel = (name: string) =>
  name.trim().toLowerCase() === PROMOTION_LABEL.name.toLowerCase();

/** Publiek fields whose values the activity log keeps; the free texts by name only. */
export const AUDIENCE_LOGGED_VALUES = [
  'audiences',
  'ageMin',
  'ageMax',
  'region',
  'entryPriceCents',
  'promotionBudgetCents',
] as const;

// ── Size band ──────────────────────────────────────────────────────────────────────────────────

export type SizeBand = 'S' | 'M' | 'L';
export const SIZE_BANDS = ['S', 'M', 'L'] as const satisfies readonly SizeBand[];

/** S below 300 visitors, M 300–2000, L above 2000; null without an expected attendance. */
export function sizeBand(expectedAttendance: number | null): SizeBand | null {
  if (expectedAttendance === null) return null;
  if (expectedAttendance < 300) return 'S';
  if (expectedAttendance <= 2000) return 'M';
  return 'L';
}

// ── Guards ─────────────────────────────────────────────────────────────────────────────────────

/** Fewer weeks than this before the start: a warning, and only last-minute actions. */
export const LAST_MINUTE_WEEKS = 3;

/** Publiek fields whose absence makes the plan weaker, but doesn't stop it. */
export type PromotionMissingField = 'pitch' | 'expectedAttendance';

export interface PromotionGuardInput {
  audiences: readonly PromotionAudience[];
  pitch: string | null;
  expectedAttendance: number | null;
  /** Brussels calendar days, "YYYY-MM-DD". */
  today: string;
  eventStartDate: string;
  /** Archived events can't change. */
  readOnly: boolean;
}

export interface PromotionGuard {
  /**
   * `ready`: Mila may make a plan. `blocked`: the Publiek lacks what she needs (`blockedBy`).
   * `disabled`: too late (the event started) or the event is archived.
   */
  state: 'ready' | 'blocked' | 'disabled';
  blockedBy: 'audience' | null;
  /** Filled in, the plan gets better: listed in a warning with a link to Publiek. */
  missing: PromotionMissingField[];
  /** Under three weeks to go: only actions that can still be done in time. */
  lastMinute: boolean;
  /** Whole days until the start (0 on the day itself). */
  daysLeft: number;
}

export function promotionGuard(input: PromotionGuardInput): PromotionGuard {
  const daysLeft = Math.max(0, daysBetween(input.today, input.eventStartDate));
  const missing: PromotionMissingField[] = [];
  if (!input.pitch?.trim()) missing.push('pitch');
  if (input.expectedAttendance === null) missing.push('expectedAttendance');
  const started = input.today >= input.eventStartDate;
  const state =
    input.readOnly || started ? 'disabled' : input.audiences.length === 0 ? 'blocked' : 'ready';
  return {
    state,
    // Only when that is what stops her: a started event says "disabled", not "fill in the Publiek".
    blockedBy: state === 'blocked' ? 'audience' : null,
    missing,
    lastMinute: !started && daysLeft < LAST_MINUTE_WEEKS * 7,
    daysLeft,
  };
}

/** The guard for a stored event and its Publiek (none yet: blocked), on Brussels' today. */
export function promotionGuardFor(
  event: {
    startsAt: Date;
    status: Parameters<typeof isReadOnly>[0];
    expectedAttendance: number | null;
  },
  audience: { audiences: readonly PromotionAudience[]; pitch: string | null } | undefined,
  now = new Date(),
): PromotionGuard {
  return promotionGuard({
    audiences: audience?.audiences ?? [],
    pitch: audience?.pitch ?? null,
    expectedAttendance: event.expectedAttendance,
    today: todayInBrussels(now),
    eventStartDate: todayInBrussels(event.startsAt),
    readOnly: isReadOnly(event.status),
  });
}

// ── Budget ─────────────────────────────────────────────────────────────────────────────────────

/** Without a promotion budget, each action may cost at most this (in cents): free or cheap. */
export const CHEAP_ACTION_MAX_CENTS = 5000;

export interface PromotionBudgetLine {
  type: 'income' | 'expense';
  estimatedCents: number | null;
  actualCents: number | null;
}

/**
 * What is left for new actions: the promotion budget minus what the Promotie lines already cost
 * (the actual amount, else the estimate). Null without a budget: then only cheap actions.
 */
export function promotionBudget(
  budgetCents: number | null,
  promotionLines: PromotionBudgetLine[],
): { budgetCents: number | null; spentCents: number; availableCents: number | null } {
  const spentCents = promotionLines
    .filter((line) => line.type === 'expense')
    .reduce((sum, line) => sum + (line.actualCents ?? line.estimatedCents ?? 0), 0);
  return {
    budgetCents,
    spentCents,
    availableCents: budgetCents === null ? null : Math.max(0, budgetCents - spentCents),
  };
}

// ── Pilot metric ───────────────────────────────────────────────────────────────────────────────

/** "X voorgesteld · Y aanvaard · Z klaar": closed-as-stale suggestions don't count as suggested. */
export function promotionMetric(
  suggestions: { status: 'pending' | 'accepted' | 'rejected' | 'dismissed_stale' }[],
  acceptedTaskStatuses: string[],
): { suggested: number; accepted: number; done: number } {
  return {
    suggested: suggestions.filter((s) => s.status !== 'dismissed_stale').length,
    accepted: suggestions.filter((s) => s.status === 'accepted').length,
    done: acceptedTaskStatuses.filter((status) => status === 'done').length,
  };
}

// ── Dates ──────────────────────────────────────────────────────────────────────────────────────

/** Calendar days from `from` to `to`, both "YYYY-MM-DD". */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** `YYYY-MM-DD` plus `days`, as a calendar date. */
export function addDays(date: string, days: number): string {
  const result = new Date(`${date}T00:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}
