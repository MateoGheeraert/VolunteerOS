import type { EventType } from '../../db/schema/index.js';
import type { BudgetInsightPayload, Citation } from '../ai.types.js';
import { BUDGET_CHECKLIST, checklistFor, type ChecklistItem } from './budget-checklist.js';
import { budgetInsight, isVariable, type MathLine } from './budget-review.math.js';

/** A budget line as the review sees it. Amounts are euro cents. */
export interface ReviewBudgetLine extends MathLine {
  id: string;
  notes: string | null;
  supplier: { id: string; name: string; archived: boolean } | null;
}

/** Everything a budget-review run may tell the model. Dates are Brussels calendar days. */
export interface BudgetReviewContextInput {
  language: string;
  today: string;
  event: {
    id: string;
    name: string;
    eventType: EventType;
    description: string | null;
    location: string | null;
    startDate: string;
    endDate: string;
    expectedAttendance: number | null;
  };
  previousEdition: {
    id: string;
    name: string;
    actualAttendance: number | null;
    expectedAttendance: number | null;
    retrospective: string | null;
    lines: ReviewBudgetLine[];
  } | null;
  currentLines: ReviewBudgetLine[];
  /** The event's tasks; `hasBudgetLine` when a budget line links to it. */
  tasks: { id: string; title: string; hasBudgetLine: boolean }[];
  /** Earlier line suggestions for this event, so the model doesn't repeat them. */
  earlierSuggestions: { title: string; status: string }[];
  /** What the organizer told Mila to take into account; null when nothing. */
  instruction?: string | null;
}

/** The records the planner turns references into: previous lines, checklist items, tasks. */
export interface BudgetReviewRecords {
  previousLines: ReadonlyMap<string, ReviewBudgetLine>;
  checklist: ReadonlyMap<string, ChecklistItem>;
  tasks: ReadonlyMap<string, { id: string; title: string; hasBudgetLine: boolean }>;
}

export interface BudgetReviewContext {
  prompt: string;
  /** Short reference used in the prompt → the record it stands for. */
  refs: Map<string, Citation>;
  records: BudgetReviewRecords;
  /** The insight's figures, computed here and put in words by the model. */
  insight: BudgetInsightPayload;
}

const euro = new Intl.NumberFormat('nl-BE', { style: 'currency', currency: 'EUR' });
/** "€ 782,30", "€ -420,00", with a plain space. */
export const formatEuro = (cents: number) => euro.format(cents / 100).replace(/\s/g, ' ');

/**
 * The run's prompt: the event, last edition's settled budget, the current budget, the tasks, the
 * checklist and the computed figures, as numbered records (E, P, P1, B1, T1, C1). The model cites
 * references; ids stay on the server. Amounts are never the model's: it names the record an
 * amount comes from, and the planner computes it.
 */
export function buildBudgetReviewContext(
  input: BudgetReviewContextInput,
  checklist: readonly ChecklistItem[] = BUDGET_CHECKLIST,
): BudgetReviewContext {
  const refs = new Map<string, Citation>();
  const previousLines = new Map<string, ReviewBudgetLine>();
  const checklistRefs = new Map<string, ChecklistItem>();
  const taskRefs = new Map<string, { id: string; title: string; hasBudgetLine: boolean }>();
  const lines: string[] = [];
  const { event, previousEdition: previous } = input;

  lines.push(`today: ${input.today}`, `output language: ${input.language}`, '');

  refs.set('E', { type: 'event', id: event.id, label: event.name });
  lines.push('Event:', `[E] ${event.name}`, `type: ${event.eventType}`);
  lines.push(`dates: ${event.startDate} to ${event.endDate}`);
  if (event.description) lines.push(`description: ${event.description}`);
  if (event.location) lines.push(`location: ${event.location}`);
  lines.push(`expected visitors: ${event.expectedAttendance ?? 'unknown'}`, '');

  if (previous) {
    refs.set('P', { type: 'event', id: previous.id, label: previous.name });
    lines.push('Previous edition:', `[P] ${previous.name}`);
    lines.push(`actual visitors: ${previous.actualAttendance ?? 'unknown'}`);
    if (previous.retrospective) lines.push(`lessons learned: ${previous.retrospective}`);
    lines.push('Its budget lines, as settled:');
    // Same title is matched here; the model only has to match by meaning what is left.
    const currentByTitle = new Map(
      input.currentLines.map((line, index) => [normalize(line.title), `B${index + 1}`]),
    );
    previous.lines.forEach((line, index) => {
      const ref = `P${index + 1}`;
      previousLines.set(ref, line);
      refs.set(ref, {
        type: 'budget_entry',
        id: line.id,
        label: `${previous.name}: ${line.title}`,
      });
      const match = currentByTitle.get(normalize(line.title));
      const status =
        input.currentLines.length === 0
          ? ''
          : match
            ? ` | in current budget as ${match}`
            : ' | NOT in current budget by title: check by meaning';
      lines.push(`[${ref}] ${describeLine(line)}${status}`);
    });
    if (previous.lines.length === 0) lines.push('none');
  } else {
    lines.push('No previous edition.');
  }
  lines.push('');

  if (input.currentLines.length === 0) {
    lines.push('Current budget: empty. Make a full draft: income and expenses.');
  } else {
    lines.push('Current budget (already planned; never propose these again, by meaning):');
    input.currentLines.forEach((line, index) => {
      const ref = `B${index + 1}`;
      refs.set(ref, { type: 'budget_entry', id: line.id, label: line.title });
      lines.push(`[${ref}] ${describeLine(line)}`);
    });
  }
  lines.push('');

  if (input.tasks.length === 0) {
    lines.push('Tasks: none');
  } else {
    lines.push('Tasks:');
    input.tasks.forEach((task, index) => {
      const ref = `T${index + 1}`;
      taskRefs.set(ref, { id: task.id, title: task.title, hasBudgetLine: task.hasBudgetLine });
      refs.set(ref, { type: 'task', id: task.id, label: task.title });
      lines.push(`[${ref}] ${task.title}${task.hasBudgetLine ? ' (has a budget line)' : ''}`);
    });
  }
  lines.push('');

  const items = checklistFor(event.eventType, event.expectedAttendance, checklist);
  lines.push('Checklist of typical costs in Belgium (richtprijs: indicative range):');
  items.forEach((item, index) => {
    const ref = `C${index + 1}`;
    checklistRefs.set(ref, item);
    refs.set(ref, { type: 'checklist', id: item.key, label: item.title });
    const size =
      item.minAttendance !== undefined && event.expectedAttendance === null
        ? ` (only from ${item.minAttendance} visitors)`
        : '';
    lines.push(
      `[${ref}] ${item.title} | applies when: ${item.when}${size} | richtprijs ` +
        `${formatEuro(item.minCents)}–${formatEuro(item.maxCents)} | ${item.reason}`,
    );
  });
  lines.push('');

  const insight = budgetInsight({
    currentLines: input.currentLines,
    expectedAttendance: event.expectedAttendance,
    previousEdition: previous
      ? { name: previous.name, attendance: previous.actualAttendance, lines: previous.lines }
      : null,
  });
  lines.push(...describeInsight(insight), '');

  if (input.earlierSuggestions.length > 0) {
    lines.push('Suggested before (do not repeat):');
    for (const suggestion of input.earlierSuggestions) {
      lines.push(`- ${suggestion.title} (${suggestion.status})`);
    }
    lines.push('');
  }

  if (input.instruction) {
    refs.set('R', { type: 'request', id: event.id, label: input.instruction.slice(0, 80) });
    lines.push(`[R] The organizer says: "${input.instruction}"`);
  }

  return {
    prompt: lines.join('\n').trim(),
    refs,
    records: { previousLines, checklist: checklistRefs, tasks: taskRefs },
    insight,
  };
}

function describeLine(line: ReviewBudgetLine): string {
  const parts = [line.type, line.title];
  if (line.estimatedCents !== null) parts.push(`estimated ${formatEuro(line.estimatedCents)}`);
  parts.push(
    line.actualCents !== null ? `actual ${formatEuro(line.actualCents)}` : 'no actual amount',
  );
  parts.push(isVariable(line) ? 'grows with visitors' : 'fixed');
  if (line.labels.length > 0) parts.push(`labels: ${line.labels.join(', ')}`);
  if (line.supplier) parts.push(`supplier: ${line.supplier.name}`);
  if (line.notes) parts.push(`notes: ${line.notes}`);
  return parts.join(' | ');
}

/** The computed figures, for the model to explain (never to change). */
function describeInsight(insight: BudgetInsightPayload): string[] {
  const out = ['Figures computed by the app (explain these; never compute or change numbers):'];
  if (insight.basis === 'none') {
    out.push('No amounts yet: there is no result to compute.');
    return out;
  }
  if (insight.basis === 'previous_edition') {
    out.push(
      'The budget is empty, so these are the previous edition’s settled lines, scaled to the ' +
        'expected visitors.',
    );
  }
  const { split } = insight;
  out.push(
    `planned income ${formatEuro(insight.incomeCents)} (fixed ${formatEuro(split.fixedIncomeCents)}, ` +
      `grows with visitors ${formatEuro(split.variableIncomeCents)})`,
    `planned costs ${formatEuro(insight.expenseCents)} (fixed ${formatEuro(split.fixedExpenseCents)}, ` +
      `grows with visitors ${formatEuro(split.variableExpenseCents)})`,
    `expected result ${formatEuro(insight.resultCents)}`,
  );
  if (insight.perVisitor) {
    out.push(
      `previous edition per visitor: income ${formatEuro(insight.perVisitor.incomeCents)}, ` +
        `costs ${formatEuro(insight.perVisitor.expenseCents)}`,
    );
    for (const line of insight.perVisitor.lines) {
      out.push(`- ${line.title} (${line.type}): ${formatEuro(line.cents)} per visitor`);
    }
  }
  for (const scenario of insight.scenarios) {
    const change =
      scenario.changePercent > 0 ? `+${scenario.changePercent}` : scenario.changePercent;
    out.push(
      `at ${scenario.attendance} visitors (${change}%): result ${formatEuro(scenario.resultCents)}, ` +
        `${formatEuro(Math.abs(scenario.differenceCents))} ` +
        `${scenario.differenceCents < 0 ? 'less' : 'more'}; fixed costs stay the same`,
    );
  }
  return out;
}

const normalize = (text: string) => text.trim().toLowerCase().replace(/\s+/g, ' ');
