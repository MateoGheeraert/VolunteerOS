import type {
  EventRow,
  TaskPriority,
  TaskStatus,
  BudgetEntryType,
  AssignmentStatus,
} from '../../db/schema/index.js';

/**
 * Pure rules for the event overview (docs/info.md §7.2): which phase the event is in, the status
 * color of each card, and which Mila hints show. No database, so they are unit-tested on their own.
 */

export type Phase = 'before' | 'during' | 'after';
/** `neutral`: nothing to judge yet (an empty card), so no status color. */
export type CardStatus = 'ok' | 'warn' | 'bad' | 'neutral';

const DAY_MS = 24 * 60 * 60 * 1000;

/** An unfinished task due within this many days makes the task card amber. */
export const TASK_DUE_SOON_DAYS = 7;
/** Closer to the start than this, a planning under half filled turns red. */
export const PLANNING_RISK_DAYS = 21;
/** From this share of the estimated expenses spent, the budget card turns amber. */
export const BUDGET_WARN_RATIO = 0.9;
/** "Find missing tasks" is offered again when it last ran longer ago than this. */
export const FIND_MISSING_STALE_DAYS = 14;
/** …and only while the event is further away than this. */
export const FIND_MISSING_MIN_DAYS_LEFT = 7;

export function phaseOf(event: Pick<EventRow, 'startsAt' | 'endsAt'>, now: Date): Phase {
  if (now < event.startsAt) return 'before';
  if (now < event.endsAt) return 'during';
  return 'after';
}

/** Whole days until the start, rounded up ("in 1 day" until the very start); 0 once started. */
export const daysUntil = (at: Date, now: Date) =>
  Math.max(0, Math.ceil((at.getTime() - now.getTime()) / DAY_MS));

/** An unfinished task is overdue when its due day (Brussels, "YYYY-MM-DD") is before today. */
export const isOverdue = (dueDate: string | null, today: string) =>
  dueDate !== null && dueDate < today;

/** Calendar days from `from` to `to`, both "YYYY-MM-DD". */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

// ── Tasks ──────────────────────────────────────────────────────────────────────────────────────

export interface OverviewTask {
  status: TaskStatus;
  priority: TaskPriority;
  /** "YYYY-MM-DD" or null. */
  dueDate: string | null;
  assigned: boolean;
}

export interface TaskStats {
  total: number;
  done: number;
  inProgress: number;
  todo: number;
  /** Not done and nobody on it. */
  unassigned: number;
  overdue: number;
  dueSoon: number;
  highPriorityUnassigned: number;
}

/** `today` is a Brussels calendar day ("YYYY-MM-DD"), like the task page's. */
export function taskStats(tasks: OverviewTask[], today: string): TaskStats {
  const stats: TaskStats = {
    total: tasks.length,
    done: 0,
    inProgress: 0,
    todo: 0,
    unassigned: 0,
    overdue: 0,
    dueSoon: 0,
    highPriorityUnassigned: 0,
  };
  for (const task of tasks) {
    if (task.status === 'done') {
      stats.done++;
      continue;
    }
    if (task.status === 'in_progress') stats.inProgress++;
    else stats.todo++;
    if (!task.assigned) {
      stats.unassigned++;
      if (task.priority === 'high') stats.highPriorityUnassigned++;
    }
    if (task.dueDate) {
      if (isOverdue(task.dueDate, today)) stats.overdue++;
      else if (daysBetween(today, task.dueDate) <= TASK_DUE_SOON_DAYS) stats.dueSoon++;
    }
  }
  return stats;
}

/** Red: something is overdue. Amber: due soon, or an important task nobody has. */
export function taskStatus(stats: TaskStats): CardStatus {
  if (stats.total === 0) return 'neutral';
  if (stats.overdue > 0) return 'bad';
  if (stats.dueSoon > 0 || stats.highPriorityUnassigned > 0) return 'warn';
  return 'ok';
}

const PRIORITY_RANK: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 };

/**
 * The unfinished tasks to look at first: overdue and soonest due first, then tasks without a due
 * date, most important first.
 */
export function nextTasks<T extends OverviewTask>(tasks: T[], limit = 3): T[] {
  return tasks
    .filter((task) => task.status !== 'done')
    .toSorted((a, b) => {
      if (a.dueDate !== b.dueDate) {
        if (a.dueDate === null) return 1;
        if (b.dueDate === null) return -1;
        return a.dueDate < b.dueDate ? -1 : 1;
      }
      return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    })
    .slice(0, limit);
}

// ── Planning ───────────────────────────────────────────────────────────────────────────────────

export interface OverviewShift {
  teamId: string;
  capacity: number;
  assignments: AssignmentStatus[];
}

export interface Coverage {
  /** Places asked for: the shifts' capacity. */
  positions: number;
  /** Places taken, proposed or confirmed. People over a shift's capacity don't count. */
  filled: number;
  /** The part of `filled` that is confirmed. */
  confirmed: number;
}

export function coverage(shifts: Pick<OverviewShift, 'capacity' | 'assignments'>[]): Coverage {
  let positions = 0;
  let filled = 0;
  let confirmed = 0;
  for (const shift of shifts) {
    positions += shift.capacity;
    filled += Math.min(shift.assignments.length, shift.capacity);
    const confirmedCount = shift.assignments.filter((status) => status === 'confirmed').length;
    confirmed += Math.min(confirmedCount, shift.capacity);
  }
  return { positions, filled, confirmed };
}

/**
 * Green when every place is taken. Without places (no shifts yet), an event that also has no
 * volunteers is as empty as it gets; one with volunteers has nothing to measure. Close to the
 * event, under half filled is red; otherwise amber. After the event nothing is at risk anymore.
 */
export function planningStatus(input: {
  coverage: Coverage;
  applications: number;
  phase: Phase;
  daysToStart: number;
}): CardStatus {
  if (input.phase === 'after') return 'neutral';
  const { positions, filled } = input.coverage;
  const close = input.daysToStart <= PLANNING_RISK_DAYS;
  if (positions === 0) {
    if (input.applications > 0) return 'neutral';
    return close ? 'bad' : 'warn';
  }
  if (filled >= positions) return 'ok';
  if (close && filled / positions < 0.5) return 'bad';
  return 'warn';
}

// ── Budget ─────────────────────────────────────────────────────────────────────────────────────

export interface OverviewBudgetEntry {
  type: BudgetEntryType;
  estimatedCents: number | null;
  actualCents: number | null;
}

export interface Amounts {
  estimated: number;
  actual: number;
}

export interface BudgetTotals {
  income: Amounts;
  expense: Amounts;
  /** Income minus expenses. */
  result: Amounts;
}

/** Like the budget page: a missing amount counts as 0, an estimate never stands in for an actual. */
export function budgetTotals(entries: OverviewBudgetEntry[]): BudgetTotals {
  const income = { estimated: 0, actual: 0 };
  const expense = { estimated: 0, actual: 0 };
  for (const entry of entries) {
    const side = entry.type === 'income' ? income : expense;
    side.estimated += entry.estimatedCents ?? 0;
    side.actual += entry.actualCents ?? 0;
  }
  return {
    income,
    expense,
    result: {
      estimated: income.estimated - expense.estimated,
      actual: income.actual - expense.actual,
    },
  };
}

/**
 * Before and during the event: red once more is spent than estimated, amber from 90% of it.
 * After: the result counts, red when it is negative.
 */
export function budgetStatus(input: {
  entryCount: number;
  totals: BudgetTotals;
  phase: Phase;
}): CardStatus {
  if (input.entryCount === 0) return 'neutral';
  const { expense, result } = input.totals;
  if (input.phase === 'after') return result.actual < 0 ? 'bad' : 'ok';
  // Spending without an estimate is more than was planned, too.
  if (expense.actual > expense.estimated) return 'bad';
  if (expense.estimated === 0) return 'ok';
  if (expense.actual >= expense.estimated * BUDGET_WARN_RATIO) return 'warn';
  return 'ok';
}

// ── Mila ───────────────────────────────────────────────────────────────────────────────────────

/** Mila's suggestion under the event's title: publish a draft, or complete an event that is over. */
export function statusSuggestion(
  event: Pick<EventRow, 'status' | 'endsAt'>,
  now: Date,
): 'publish' | 'complete' | null {
  if (event.status === 'draft') return 'publish';
  if (event.status === 'published' && event.endsAt < now) return 'complete';
  return null;
}

/** Every hint Mila can give on the overview; the API schemas use this list too. */
export const HINT_KEYS = [
  'tasks.setup',
  'tasks.review',
  'tasks.find_missing',
  // docs/info.md §7.7.1 D.
  'planning.setup',
  'planning.review',
  'planning.allocate',
  'budget.setup',
  'budget.review',
] as const;
export type HintKey = (typeof HINT_KEYS)[number];
/** The cards Mila can speak in. */
export const HINT_CARDS = ['tasks', 'planning', 'budget'] as const;
export type HintCard = (typeof HINT_CARDS)[number];

export interface Hint {
  key: HintKey;
  card: HintCard;
  /** The situation it was made in: dismissing stores it, and a new one brings the hint back. */
  fingerprint: string;
  /**
   * Shown in full; otherwise a small chip. A setup hint is always in full: in an empty card she
   * is the empty state. Of the other hints at most one is, and none while the status banner shows.
   */
  highlighted: boolean;
}

export interface HintInput {
  /** Only the people who may act on what Mila proposes see her. */
  canManage: boolean;
  aiEnabled: boolean;
  readOnly: boolean;
  phase: Phase;
  daysToStart: number;
  now: Date;
  taskCount: number;
  /** Mila's task suggestions waiting for a decision, and when the newest was made. */
  pendingTaskSuggestions: { count: number; newestAt: Date | null };
  /** Whether a task-suggestion run is queued or running right now. */
  findMissingRunning: boolean;
  /** The last finished task-suggestion run. */
  lastFindMissing: { id: string; finishedAt: Date } | null;
  budgetEntryCount: number;
  /** Mila's budget lines waiting for a decision, and when the newest was made. */
  pendingBudgetLines: { count: number; newestAt: Date | null };
  /** Whether a budget review is queued or running right now. */
  budgetReviewRunning: boolean;
  /** Whether the status banner (also Mila) is on the page: then no card hint is highlighted. */
  statusSuggestionShown: boolean;
  /** The planning card: teams, Mila's waiting planning cards, and whether she works on it. */
  planning: {
    teamCount: number;
    pendingSuggestions: { count: number; newestAt: Date | null };
    running: boolean;
    /** Places not taken yet, and volunteers on no shift. */
    openPlaces: number;
    unassignedVolunteers: number;
  };
  /** The caller's dismissed hints: key → fingerprint. */
  dismissed: ReadonlyMap<string, string>;
}

/**
 * Mila's hints on the overview, balanced so she doesn't bombard the organizer:
 * - Only where she can act (tasks, planning and budget), only for managers, only before the event.
 * - In an empty card she is the empty state; with data she only speaks when she has something
 *   concrete. At most one hint per card.
 * - In an empty card her setup offer is shown in full. Of her other hints one on the page is,
 *   none when the status banner already speaks for her.
 * - A dismissed hint stays away until its fingerprint changes.
 */
export function selectHints(input: HintInput): Hint[] {
  if (!input.canManage || !input.aiEnabled || input.readOnly || input.phase !== 'before') {
    return [];
  }

  const candidates: Omit<Hint, 'highlighted'>[] = [];
  const review = input.pendingTaskSuggestions;
  if (review.count > 0) {
    candidates.push({
      key: 'tasks.review',
      card: 'tasks',
      fingerprint: review.newestAt?.toISOString() ?? 'pending',
    });
  }
  if (input.taskCount === 0) {
    candidates.push({ key: 'tasks.setup', card: 'tasks', fingerprint: 'empty' });
  } else if (findMissingIsStale(input)) {
    candidates.push({
      key: 'tasks.find_missing',
      card: 'tasks',
      fingerprint: input.lastFindMissing?.id ?? 'never',
    });
  }
  const budgetLines = input.pendingBudgetLines;
  if (budgetLines.count > 0) {
    candidates.push({
      key: 'budget.review',
      card: 'budget',
      fingerprint: budgetLines.newestAt?.toISOString() ?? 'pending',
    });
  } else if (input.budgetEntryCount === 0 && !input.budgetReviewRunning) {
    candidates.push({ key: 'budget.setup', card: 'budget', fingerprint: 'empty' });
  }

  // Planning: her waiting cards first, then teams for an empty board, then dividing the open
  // places over volunteers who have none. Nothing while she is working on it.
  const planning = input.planning;
  if (!planning.running) {
    if (planning.pendingSuggestions.count > 0) {
      candidates.push({
        key: 'planning.review',
        card: 'planning',
        fingerprint: planning.pendingSuggestions.newestAt?.toISOString() ?? 'pending',
      });
    }
    if (planning.teamCount === 0) {
      candidates.push({ key: 'planning.setup', card: 'planning', fingerprint: 'empty' });
    } else if (planning.openPlaces > 0 && planning.unassignedVolunteers > 0) {
      candidates.push({
        key: 'planning.allocate',
        card: 'planning',
        fingerprint: `${planning.openPlaces}:${planning.unassignedVolunteers}`,
      });
    }
  }

  const shown: Hint[] = [];
  const cardsWithHint = new Set<HintCard>();
  let highlightTaken = input.statusSuggestionShown;
  for (const candidate of candidates) {
    if (cardsWithHint.has(candidate.card)) continue;
    if (input.dismissed.get(candidate.key) === candidate.fingerprint) continue;
    cardsWithHint.add(candidate.card);
    const isSetup = candidate.key.endsWith('.setup');
    const highlighted = isSetup || !highlightTaken;
    if (highlighted && !isSetup) highlightTaken = true;
    shown.push({ ...candidate, highlighted });
  }
  return shown;
}

function findMissingIsStale(input: HintInput): boolean {
  if (input.findMissingRunning) return false;
  if (input.daysToStart <= FIND_MISSING_MIN_DAYS_LEFT) return false;
  if (!input.lastFindMissing) return true;
  const age = input.now.getTime() - input.lastFindMissing.finishedAt.getTime();
  return age > FIND_MISSING_STALE_DAYS * DAY_MS;
}

// ── Promotion ──────────────────────────────────────────────────────────────────────────────────

export interface OverviewPromoTask {
  status: TaskStatus;
  /** "YYYY-MM-DD" or null. */
  dueDate: string | null;
}

/** The unfinished Promotie tasks whose due day is before today (Brussels, "YYYY-MM-DD"). */
export function overduePromoTasks<T extends OverviewPromoTask>(tasks: T[], today: string): T[] {
  return tasks.filter((task) => task.status !== 'done' && isOverdue(task.dueDate, today));
}

/** Red when a Promotie task is overdue; neutral without Promotie tasks; green otherwise. */
export function promotionStatus(tasks: OverviewPromoTask[], today: string): CardStatus {
  if (tasks.length === 0) return 'neutral';
  return overduePromoTasks(tasks, today).length > 0 ? 'bad' : 'ok';
}
