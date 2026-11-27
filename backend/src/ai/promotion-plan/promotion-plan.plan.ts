import { addDays, daysBetween } from '../../features/promotion/promotion-rules.js';
import type { Citation, PromoActionPayload } from '../ai.types.js';
import type { PromoCatalogItem } from './promotion-catalog.js';
import type { PromotionPlanOutput } from './promotion-plan.schema.js';

/** A plan never holds more actions than this, whatever the model returns. */
export const MAX_PROMO_ACTIONS = 10;

/** What the planner needs to know about the event right now. Dates are Brussels calendar days. */
export interface PromotionPlanState {
  eventStartDate: string;
  today: string;
  /** Null without a promotion budget: then every action must be cheap. */
  availableCents: number | null;
  cheapMaxCents: number;
  /** Titles of the event's tasks: an action that is already a task is not proposed again. */
  existingTaskTitles: string[];
  /** Dedup keys of promo suggestions already accepted or rejected: they never return. */
  decidedKeys: ReadonlySet<string>;
}

export interface PlannedPromoAction {
  kind: 'promo_action';
  dedupKey: string;
  title: string;
  explanation: string;
  payload: PromoActionPayload;
  citations: Citation[];
}

/** An output item the planner left out, and why: logged as an evaluation signal. */
export interface DroppedPromoAction {
  title: string;
  reason: 'empty' | 'unbacked' | 'exists' | 'decided' | 'duplicate' | 'over_budget' | 'too_many';
}

export interface PromotionPlan {
  suggestions: PlannedPromoAction[];
  dropped: DroppedPromoAction[];
  totalCostCents: number;
}

const CATALOG_REF = /^C\d+$/;
const PREVIOUS_TASK_REF = /^P\d+$/;

/**
 * Turns the model's plan into the suggestions to save, applying every rule the model may miss:
 * - every action has a title;
 * - every action cites a catalogue action or a previous-edition task (citing only the event is
 *   not enough), and every reference it cites was sent;
 * - no action that is already a task, or was accepted or rejected before;
 * - the due date is never before today;
 * - an action costs at least its catalogue minimum;
 * - the total cost stays within the available budget, kept in the model's order (free actions
 *   always fit); without a budget each action costs at most `cheapMaxCents`;
 * - at most MAX_PROMO_ACTIONS.
 */
export function planPromotionActions(
  output: PromotionPlanOutput,
  refs: ReadonlyMap<string, Citation>,
  catalogRefs: ReadonlyMap<string, PromoCatalogItem>,
  state: PromotionPlanState,
): PromotionPlan {
  const suggestions: PlannedPromoAction[] = [];
  const dropped: DroppedPromoAction[] = [];
  const existing = new Set(state.existingTaskTitles.map(normalize));
  const seen = new Set<string>();
  let totalCostCents = 0;

  for (const action of output.actions) {
    const title = action.title.trim().slice(0, 200);
    const cites = [...new Set(action.cites.map((cite) => cite.trim()))];
    const citations = resolve(cites, refs);
    const catalogRef = cites.find((cite) => CATALOG_REF.test(cite) && catalogRefs.has(cite));
    const taskRef = cites.find((cite) => PREVIOUS_TASK_REF.test(cite) && refs.has(cite));
    const drop = (reason: DroppedPromoAction['reason']) => dropped.push({ title, reason });

    if (title === '') {
      drop('empty');
      continue;
    }
    if (!citations || (!catalogRef && !taskRef)) {
      drop('unbacked');
      continue;
    }
    const catalogItem = catalogRef ? catalogRefs.get(catalogRef)! : null;
    const dedupKey = catalogItem
      ? `promo:${catalogItem.key}`
      : `promo:task:${refs.get(taskRef!)!.id}`;
    if (existing.has(normalize(title))) {
      drop('exists');
      continue;
    }
    if (state.decidedKeys.has(dedupKey)) {
      drop('decided');
      continue;
    }
    if (seen.has(dedupKey)) {
      drop('duplicate');
      continue;
    }

    // Never cheaper than the catalogue says: an action priced at €0 by the model still counts.
    const costCents = Math.max(
      Math.max(0, Math.round(action.estimatedCostEuros)) * 100,
      catalogItem?.costMinCents ?? 0,
    );
    if (state.availableCents === null) {
      if (costCents > state.cheapMaxCents) {
        drop('over_budget');
        continue;
      }
    } else if (costCents > 0 && totalCostCents + costCents > state.availableCents) {
      drop('over_budget');
      continue;
    }
    if (suggestions.length >= MAX_PROMO_ACTIONS) {
      drop('too_many');
      continue;
    }

    seen.add(dedupKey);
    totalCostCents += costCents;
    const { dueDate, weeksBefore } = dueDateFor(state, action.weeksBefore);
    suggestions.push({
      kind: 'promo_action',
      dedupKey,
      title,
      explanation: action.why.trim(),
      payload: {
        catalogKey: catalogItem?.key ?? null,
        title,
        type: action.type,
        audience: action.audience.trim().slice(0, 200),
        weeksBefore,
        dueDate,
        estimatedCostCents: costCents,
        effort: action.effort,
        howTo: action.howTo.trim().slice(0, 2000),
      },
      citations,
    });
  }

  return { suggestions, dropped, totalCostCents };
}

/** The start minus `weeksBefore` weeks, moved to today when that is already past. */
export function dueDateFor(
  state: Pick<PromotionPlanState, 'eventStartDate' | 'today'>,
  weeksBefore: number,
): { dueDate: string; weeksBefore: number } {
  const weeks = Math.min(52, Math.max(0, Math.round(weeksBefore)));
  let dueDate = addDays(state.eventStartDate, -7 * weeks);
  if (dueDate < state.today) dueDate = state.today;
  if (dueDate > state.eventStartDate) dueDate = state.eventStartDate;
  return {
    dueDate,
    weeksBefore: Math.floor(daysBetween(dueDate, state.eventStartDate) / 7),
  };
}

/** The cited records, or null when nothing is cited or any reference is unknown. */
function resolve(cites: string[], refs: ReadonlyMap<string, Citation>): Citation[] | null {
  if (cites.length === 0) return null;
  const citations = cites.map((ref) => refs.get(ref));
  return citations.every((citation) => citation !== undefined) ? citations : null;
}

const normalize = (text: string) => text.trim().toLowerCase().replace(/\s+/g, ' ');
