import type {
  BudgetInsightPayload,
  BudgetLineEstimate,
  BudgetLinePayload,
  Citation,
} from '../ai.types.js';
import { coversItem } from './budget-checklist.js';
import type { BudgetReviewRecords } from './budget-review.context.js';
import { richtprijsEstimate, scaleFromPrevious } from './budget-review.math.js';
import type { BudgetReviewOutput } from './budget-review.schema.js';

/** What the planner needs to know about the event right now. */
export interface BudgetPlanState {
  /** Titles of the current budget lines. */
  existingTitles: string[];
  /** This event's labels: lower-cased name → id. */
  labelIdsByName: ReadonlyMap<string, string>;
  previousEditionName: string | null;
  /** The previous edition's actual visitors. */
  previousAttendance: number | null;
  expectedAttendance: number | null;
}

export interface PlannedBudgetLine {
  kind: 'budget_line';
  dedupKey: string;
  title: string;
  explanation: string;
  payload: BudgetLinePayload;
  citations: Citation[];
}

export interface PlannedBudgetInsight {
  kind: 'budget_insight';
  dedupKey: typeof INSIGHT_KEY;
  title: string;
  explanation: string;
  payload: BudgetInsightPayload;
  citations: Citation[];
}

/**
 * An output item the planner left out or changed, and why: logged as an evaluation signal.
 * `amount_unbacked`: the line was kept, without the amount its basis couldn't back.
 */
export interface BudgetDroppedItem {
  title: string;
  reason: 'unbacked' | 'exists' | 'duplicate' | 'too_many' | 'amount_unbacked';
}

export interface BudgetPlan {
  lines: PlannedBudgetLine[];
  insight: PlannedBudgetInsight;
  dropped: BudgetDroppedItem[];
}

/** Lines one review may propose. */
export const MAX_BUDGET_LINES = 15;

/** The insight's key: one per event, replaced by every run. */
export const INSIGHT_KEY = 'budget_insight';

export const budgetLineKey = (title: string) => `budget_line:${normalize(title)}`;

/**
 * Turns a model's output into the suggestions to save, applying every rule the model may miss:
 * - The model's verdicts become lines: a previous-edition line no current line covers (and still
 *   needed), and a checklist item that applies and nothing covers. Then its own lines (task costs,
 *   typical lines). In that order, so the most solid lines come first.
 * - Every line cites records that were sent; otherwise it is dropped.
 * - Lines already in the budget (by title, or continuing a previous line whose title is in the
 *   budget) and duplicates are dropped.
 * - Amounts are computed here from the line's basis: a previous-edition line's actual amount
 *   (scaled by visitors when it grows with them) or a checklist item's richtprijs. A basis that
 *   is missing, unknown or doesn't fit leaves the line without an amount. Never an actual amount.
 */
export function planBudgetReview(
  output: BudgetReviewOutput,
  refs: ReadonlyMap<string, Citation>,
  records: BudgetReviewRecords,
  insight: BudgetInsightPayload,
  state: BudgetPlanState,
): BudgetPlan {
  const lines: PlannedBudgetLine[] = [];
  const dropped: BudgetDroppedItem[] = [];
  const existing = new Set(state.existingTitles.map(normalize));
  const seen = new Set<string>();
  const usedBases = new Set<string>();

  for (const item of [...fromVerdicts(output, records), ...output.lines]) {
    const title = item.title.trim().slice(0, 200);
    const key = budgetLineKey(title);
    const citations = resolve(item.cites, refs);
    const previous = item.amountRef ? records.previousLines.get(item.amountRef) : undefined;
    const checklist = item.amountRef ? records.checklist.get(item.amountRef) : undefined;

    let reason: BudgetDroppedItem['reason'] | null = null;
    if (!citations || title.length === 0) reason = 'unbacked';
    else if (existing.has(normalize(title))) reason = 'exists';
    else if (previous && existing.has(normalize(previous.title))) reason = 'exists';
    // A checklist cost already in the budget, or already proposed, under another name.
    else if (checklist && state.existingTitles.some((t) => coversItem(t, checklist))) {
      reason = 'exists';
    } else if (checklist && lines.some((l) => coversItem(l.title, checklist))) {
      reason = 'duplicate';
    } else if (seen.has(key) || (item.amountRef && usedBases.has(item.amountRef))) {
      reason = 'duplicate';
    } else if (lines.length >= MAX_BUDGET_LINES) reason = 'too_many';
    if (reason || !citations) {
      dropped.push({ title: item.title, reason: reason ?? 'unbacked' });
      continue;
    }
    seen.add(key);

    let estimate: BudgetLineEstimate | null = null;
    if (previous && previous.type === item.type && previous.actualCents !== null) {
      const { cents, scaled } = scaleFromPrevious(
        { ...previous, actualCents: previous.actualCents },
        state.previousAttendance,
        state.expectedAttendance,
      );
      estimate = {
        basis: 'previous_edition',
        cents,
        source: {
          eventName: state.previousEditionName ?? '',
          title: previous.title,
          actualCents: previous.actualCents,
          attendance: state.previousAttendance,
        },
        targetAttendance: scaled ? state.expectedAttendance : null,
        scaled,
      };
    } else if (checklist && item.type === 'expense') {
      estimate = {
        basis: 'richtprijs',
        cents: richtprijsEstimate(checklist.minCents, checklist.maxCents),
        checklistKey: checklist.key,
        minCents: checklist.minCents,
        maxCents: checklist.maxCents,
      };
    } else if (item.amountRef) {
      dropped.push({ title: item.title, reason: 'amount_unbacked' });
    }
    if (estimate && item.amountRef) {
      usedBases.add(item.amountRef);
      const basis = refs.get(item.amountRef);
      if (basis && !citations.some((c) => c.type === basis.type && c.id === basis.id)) {
        citations.push(basis);
      }
    }

    const taskRecord = item.taskRef ? (records.tasks.get(item.taskRef) ?? null) : null;
    // A task that already has a budget line has its cost: never a second line for it.
    if (taskRecord?.hasBudgetLine) {
      dropped.push({ title: item.title, reason: 'exists' });
      continue;
    }
    const task = taskRecord ? { id: taskRecord.id, title: taskRecord.title } : null;
    const basisLine = estimate?.basis === 'previous_edition' ? previous : undefined;
    const labelIds = (basisLine?.labels ?? []).flatMap((name) => {
      const id = state.labelIdsByName.get(name.toLowerCase());
      return id ? [id] : [];
    });
    const supplier =
      basisLine?.supplier && !basisLine.supplier.archived
        ? { id: basisLine.supplier.id, name: basisLine.supplier.name }
        : null;

    const payload: BudgetLinePayload = {
      type: item.type,
      title,
      origin: originOf(estimate, task !== null, item.cites),
      estimate,
      labelIds,
      supplier,
      task,
    };
    lines.push({
      kind: 'budget_line',
      dedupKey: key,
      title,
      explanation: item.reason.trim().slice(0, 2000),
      payload,
      citations,
    });
  }

  const insightCitations = ['E', 'P'].flatMap((ref) => {
    const citation = refs.get(ref);
    return citation ? [citation] : [];
  });
  return {
    lines,
    insight: {
      kind: 'budget_insight',
      dedupKey: INSIGHT_KEY,
      title: output.insight.headline.trim().slice(0, 200) || '…',
      explanation: output.insight.explanation.trim().slice(0, 2000),
      payload: insight,
      citations: insightCitations,
    },
    dropped,
  };
}

type OutputLine = BudgetReviewOutput['lines'][number];

/**
 * The lines the model's verdicts call for. A verdict on a reference that isn't a previous-edition
 * line or checklist item is ignored. Whatever the model says is covered stays out, so a doubtful
 * match never proposes the same cost twice.
 */
function fromVerdicts(output: BudgetReviewOutput, records: BudgetReviewRecords): OutputLine[] {
  const lines: OutputLine[] = [];
  for (const verdict of output.previousLines) {
    const previous = records.previousLines.get(verdict.ref);
    if (!previous || !verdict.stillNeeded || verdict.coveredBy !== null) continue;
    lines.push({
      type: previous.type,
      title: verdict.title.trim() || previous.title,
      origin: 'previous_edition',
      amountRef: verdict.ref,
      taskRef: null,
      reason: verdict.reason,
      cites: [verdict.ref],
    });
  }
  for (const verdict of output.checklist) {
    if (!records.checklist.has(verdict.ref) || !verdict.applies || verdict.coveredBy !== null) {
      continue;
    }
    lines.push({
      type: 'expense',
      title: verdict.title.trim() || records.checklist.get(verdict.ref)!.title,
      origin: 'checklist',
      amountRef: verdict.ref,
      taskRef: null,
      reason: verdict.reason,
      cites: [verdict.ref, 'E'],
    });
  }
  return lines;
}

/**
 * Why the line is proposed, from what backs it rather than the model's word: the previous
 * edition's line it continues, a task, a previous-edition line it cites, a checklist item's
 * richtprijs, or else typical for the event.
 */
function originOf(
  estimate: BudgetLineEstimate | null,
  hasTask: boolean,
  cites: string[],
): BudgetLinePayload['origin'] {
  if (estimate?.basis === 'previous_edition') return 'previous_edition';
  if (hasTask) return 'task';
  if (cites.some((ref) => /^P\d+$/.test(ref))) return 'previous_edition';
  if (cites.includes('R')) return 'request';
  return estimate?.basis === 'richtprijs' ? 'checklist' : 'typical';
}

/** The cited records, or null when nothing is cited or any reference is unknown. */
function resolve(cites: string[], refs: ReadonlyMap<string, Citation>): Citation[] | null {
  const unique = [...new Set(cites)];
  if (unique.length === 0) return null;
  const citations = unique.map((ref) => refs.get(ref));
  return citations.every((citation) => citation !== undefined) ? citations : null;
}

const normalize = (text: string) => text.trim().toLowerCase().replace(/\s+/g, ' ');
