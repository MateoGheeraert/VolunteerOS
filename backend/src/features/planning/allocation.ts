import type { PlanningRuleKind } from '../../db/schema/index.js';
import { clockToMinutes } from './brussels-time.js';
import { overlaps } from './planning-rules.js';

/**
 * The allocation solver behind "Laat Mila verdelen" (docs/info.md §7.7.1 C): a deterministic
 * greedy that fills open places with volunteers who still have room. Pure and unit-tested; the
 * model never allocates, it only turns notes into rules beforehand.
 *
 * - It never moves or removes an existing assignment (proposed or confirmed): those count as taken.
 * - Hard: marked availability (or the whole event), no overlap, the shift's capacity, the
 *   volunteer's maximum number of shifts, and the hard planning rules.
 * - Soft, as a score: preferred team, "prefers team", "preferably together", an even spread,
 *   and the same team as at the previous edition.
 * - Each step takes the open place with the fewest possible candidates and places its
 *   best-scoring candidate; ties are broken by start time, name and id, so the same input always
 *   gives the same proposal.
 */

export interface SolverShift {
  id: string;
  teamId: string;
  teamName: string;
  startsAt: Date;
  endsAt: Date;
  capacity: number;
  /** Brussels clock time of the start, as `eventClock`: past 1440 for a shift after midnight. */
  startClock: number;
  /** `startClock` plus the shift's length: above 1440 when it runs past midnight. */
  endClock: number;
}

export interface SolverVolunteer {
  applicationId: string;
  volunteerId: string;
  name: string;
  wholeEvent: boolean;
  availableShiftIds: readonly string[];
  preferredTeamId: string | null;
  /** Teams (names, any case) the volunteer worked in at the previous edition. */
  previousTeams: readonly string[];
}

export type SolverRule =
  | { kind: 'not_team' | 'only_team' | 'prefers_team'; volunteerId: string; teamName: string }
  | { kind: 'never_together' | 'prefer_together'; volunteerId: string; otherVolunteerId: string }
  | { kind: 'max_shifts'; volunteerId: string; maxShifts: number }
  | { kind: 'not_before' | 'not_after'; volunteerId: string; time: string };

export interface SolverInput {
  shifts: SolverShift[];
  volunteers: SolverVolunteer[];
  /** Existing assignments, proposed and confirmed. */
  assignments: { applicationId: string; shiftId: string }[];
  /** The event's shifts per volunteer; null when volunteers come for the whole event. */
  maxShiftsPerVolunteer: number | null;
  rules: SolverRule[];
}

export type PlacementReason = 'preferred_team' | 'prefers_team' | 'together' | 'previous_team';

export interface Placement {
  applicationId: string;
  shiftId: string;
  /** Why this person here, beyond being available: shown on the chip. */
  reasons: PlacementReason[];
}

/** Why a volunteer can't take a place. */
export type BlockReason = 'not_available' | 'already_on' | 'overlap' | 'max_shifts' | 'rule';

/**
 * Why a shift keeps open places:
 * - `nobody_available`: nobody (else) marked it.
 * - `busy`: those who marked it are on another shift at that time.
 * - `max_shifts`: those who marked it already have as many shifts as they may.
 * - `rules`: a planning rule keeps them off.
 */
export type GapReason = 'nobody_available' | 'busy' | 'max_shifts' | 'rules';

export interface Gap {
  shiftId: string;
  missing: number;
  reason: GapReason;
}

/**
 * Why a volunteer who still has room got no (more) shifts:
 * - `no_shifts_marked`: they marked no shifts.
 * - `shifts_full`: their shifts are full.
 * - `busy`, `rules`: as for gaps.
 */
export type UnplacedReason = 'no_shifts_marked' | 'shifts_full' | 'busy' | 'rules';

export interface Unplaced {
  applicationId: string;
  /** Shifts still missing; for whole-event volunteers: 1 when they have none. */
  missing: number;
  reason: UnplacedReason;
}

export interface SolverResult {
  placements: Placement[];
  gaps: Gap[];
  unplaced: Unplaced[];
}

const SCORE = {
  preferredTeam: 10,
  prefersTeam: 10,
  together: 6,
  previousTeam: 4,
  /** Per shift the volunteer already has: spreads the work. */
  perShiftHeld: -4,
} as const;

/** Before this (06:00), a clock time belongs to the night after the event's day. */
const NIGHT_ENDS = 6 * 60;

/**
 * Minutes since midnight on the event's day, where the night runs on past 1440: a shift at
 * 00:30 is 1470, so "niet na 23:00" refuses it and "niet voor 18:00" allows it. Use it for the
 * start of a shift and for a rule's time alike.
 */
export const eventClock = (minutes: number) => (minutes < NIGHT_ENDS ? minutes + 24 * 60 : minutes);

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * The board as the solver sees it: who holds which shift, who is on each shift, and why a
 * volunteer can't take a shift (`block`). Shared by `allocate` and `checkPlacements`.
 */
function board(input: SolverInput) {
  const shifts = [...input.shifts].sort(
    (a, b) => a.startsAt.getTime() - b.startsAt.getTime() || a.id.localeCompare(b.id),
  );
  const shiftById = new Map(shifts.map((s) => [s.id, s]));
  const volunteers = [...input.volunteers].sort(
    (a, b) => a.name.localeCompare(b.name, 'nl') || a.applicationId.localeCompare(b.applicationId),
  );
  const rulesOf = new Map<string, SolverRule[]>();
  for (const rule of input.rules) {
    const own = rulesOf.get(rule.volunteerId) ?? [];
    own.push(rule);
    rulesOf.set(rule.volunteerId, own);
    // Pair rules hold both ways.
    if (rule.kind === 'never_together' || rule.kind === 'prefer_together') {
      const other = rulesOf.get(rule.otherVolunteerId) ?? [];
      other.push({
        ...rule,
        volunteerId: rule.otherVolunteerId,
        otherVolunteerId: rule.volunteerId,
      });
      rulesOf.set(rule.otherVolunteerId, other);
    }
  }

  // Who is on which shift now, by application; and the people on each shift, by volunteer.
  const held = new Map<string, Set<string>>(volunteers.map((v) => [v.applicationId, new Set()]));
  const onShift = new Map<string, Set<string>>(shifts.map((s) => [s.id, new Set()]));
  const appToVolunteer = new Map(volunteers.map((v) => [v.applicationId, v.volunteerId]));
  for (const a of input.assignments) {
    if (!shiftById.has(a.shiftId)) continue;
    held.get(a.applicationId)?.add(a.shiftId);
    const volunteerId = appToVolunteer.get(a.applicationId);
    // People not in `volunteers` (e.g. removed later) still take the place.
    onShift.get(a.shiftId)!.add(volunteerId ?? `application:${a.applicationId}`);
  }

  const maxFor = (v: SolverVolunteer): number => {
    const limits = (rulesOf.get(v.volunteerId) ?? [])
      .filter((r): r is Extract<SolverRule, { kind: 'max_shifts' }> => r.kind === 'max_shifts')
      .map((r) => r.maxShifts);
    const base = input.maxShiftsPerVolunteer ?? Number.POSITIVE_INFINITY;
    return Math.min(base, ...limits);
  };
  const open = (s: SolverShift) => Math.max(0, s.capacity - onShift.get(s.id)!.size);

  const block = (v: SolverVolunteer, s: SolverShift): BlockReason | null => {
    const mine = held.get(v.applicationId)!;
    if (mine.has(s.id)) return 'already_on';
    if (!v.wholeEvent && !v.availableShiftIds.includes(s.id)) return 'not_available';
    if (mine.size >= maxFor(v)) return 'max_shifts';
    for (const other of mine) {
      if (overlaps(shiftById.get(other)!, s)) return 'overlap';
    }
    for (const rule of rulesOf.get(v.volunteerId) ?? []) {
      if (breaks(rule, s, onShift.get(s.id)!)) return 'rule';
    }
    return null;
  };

  /** Puts a volunteer on a shift, so later checks see it. */
  const place = (v: SolverVolunteer, s: SolverShift) => {
    held.get(v.applicationId)!.add(s.id);
    onShift.get(s.id)!.add(v.volunteerId);
  };

  return { shifts, shiftById, volunteers, rulesOf, held, onShift, maxFor, open, block, place };
}

/**
 * Re-checks placements taken over later, in order, against the board as it is now: the same
 * hard rules as `allocate` (availability, overlap, capacity, shifts per volunteer, the rules).
 * The board may have changed since the proposal was made.
 */
export function checkPlacements<P extends { applicationId: string; shiftId: string }>(
  input: SolverInput,
  wanted: readonly P[],
): { allowed: P[]; blocked: P[] } {
  const state = board(input);
  const volunteerOf = new Map(state.volunteers.map((v) => [v.applicationId, v]));
  const allowed: P[] = [];
  const blocked: P[] = [];
  for (const placement of wanted) {
    const v = volunteerOf.get(placement.applicationId);
    const s = state.shiftById.get(placement.shiftId);
    if (!v || !s || state.open(s) === 0 || state.block(v, s) !== null) {
      blocked.push(placement);
      continue;
    }
    state.place(v, s);
    allowed.push(placement);
  }
  return { allowed, blocked };
}

export function allocate(input: SolverInput): SolverResult {
  const { shifts, volunteers, rulesOf, held, onShift, maxFor, open, block, place } = board(input);

  const score = (v: SolverVolunteer, s: SolverShift) => {
    const reasons: PlacementReason[] = [];
    let total = SCORE.perShiftHeld * held.get(v.applicationId)!.size;
    if (v.preferredTeamId === s.teamId) {
      total += SCORE.preferredTeam;
      reasons.push('preferred_team');
    }
    const rules = rulesOf.get(v.volunteerId) ?? [];
    if (rules.some((r) => r.kind === 'prefers_team' && sameName(r.teamName, s.teamName))) {
      total += SCORE.prefersTeam;
      reasons.push('prefers_team');
    }
    const people = onShift.get(s.id)!;
    if (rules.some((r) => r.kind === 'prefer_together' && people.has(r.otherVolunteerId))) {
      total += SCORE.together;
      reasons.push('together');
    }
    if (v.previousTeams.some((name) => sameName(name, s.teamName))) {
      total += SCORE.previousTeam;
      reasons.push('previous_team');
    }
    return { total, reasons };
  };

  /** How many open shifts the volunteer could still take: the scarcest go first on a tie. */
  const options = (v: SolverVolunteer) =>
    shifts.filter((s) => open(s) > 0 && block(v, s) === null).length;

  const placements: Placement[] = [];
  for (;;) {
    let best: { shift: SolverShift; candidates: SolverVolunteer[] } | null = null;
    for (const s of shifts) {
      if (open(s) === 0) continue;
      const candidates = volunteers.filter((v) => block(v, s) === null);
      if (candidates.length === 0) continue;
      if (!best || candidates.length < best.candidates.length) best = { shift: s, candidates };
    }
    if (!best) break;
    const { shift } = best;
    const ranked = best.candidates
      .map((v) => ({ v, ...score(v, shift), options: options(v) }))
      .sort(
        (a, b) =>
          b.total - a.total ||
          a.options - b.options ||
          a.v.name.localeCompare(b.v.name, 'nl') ||
          a.v.applicationId.localeCompare(b.v.applicationId),
      );
    const chosen = ranked[0]!;
    place(chosen.v, shift);
    placements.push({
      applicationId: chosen.v.applicationId,
      shiftId: shift.id,
      reasons: chosen.reasons,
    });
  }

  const gaps: Gap[] = shifts
    .filter((s) => open(s) > 0)
    .map((s) => ({ shiftId: s.id, missing: open(s), reason: gapReason(volunteers, s, block) }));

  const unplaced: Unplaced[] = [];
  for (const v of volunteers) {
    const count = held.get(v.applicationId)!.size;
    const max = maxFor(v);
    const missing = Number.isFinite(max) ? max - count : count === 0 ? 1 : 0;
    if (missing <= 0) continue;
    unplaced.push({
      applicationId: v.applicationId,
      missing,
      reason: unplacedReason(v, shifts, open, block),
    });
  }

  return { placements, gaps, unplaced };
}

/** Whether placing someone with this rule on `shift` (with `people` on it) breaks the rule. */
function breaks(rule: SolverRule, shift: SolverShift, people: ReadonlySet<string>): boolean {
  switch (rule.kind) {
    case 'not_team':
      return sameName(rule.teamName, shift.teamName);
    case 'only_team':
      return !sameName(rule.teamName, shift.teamName);
    case 'never_together':
      return people.has(rule.otherVolunteerId);
    case 'not_before': {
      const limit = clockToMinutes(rule.time);
      return limit !== null && shift.startClock < eventClock(limit);
    }
    case 'not_after': {
      const limit = clockToMinutes(rule.time);
      return limit !== null && shift.endClock > eventClock(limit);
    }
    case 'max_shifts':
    case 'prefers_team':
    case 'prefer_together':
      return false;
  }
}

const GAP_ORDER = ['rules', 'busy', 'max_shifts'] as const;

function gapReason(
  volunteers: SolverVolunteer[],
  shift: SolverShift,
  block: (v: SolverVolunteer, s: SolverShift) => BlockReason | null,
): GapReason {
  const counts: Record<Exclude<GapReason, 'nobody_available'>, number> = {
    rules: 0,
    busy: 0,
    max_shifts: 0,
  };
  for (const v of volunteers) {
    const reason = block(v, shift);
    if (reason === 'rule') counts.rules++;
    else if (reason === 'overlap') counts.busy++;
    else if (reason === 'max_shifts') counts.max_shifts++;
  }
  const top = GAP_ORDER.toSorted((a, b) => counts[b] - counts[a])[0]!;
  return counts[top] > 0 ? top : 'nobody_available';
}

function unplacedReason(
  v: SolverVolunteer,
  shifts: SolverShift[],
  open: (s: SolverShift) => number,
  block: (v: SolverVolunteer, s: SolverShift) => BlockReason | null,
): UnplacedReason {
  const marked = shifts.filter((s) => v.wholeEvent || v.availableShiftIds.includes(s.id));
  if (marked.length === 0) return 'no_shifts_marked';
  const reasons = marked
    .filter((s) => open(s) > 0)
    .map((s) => block(v, s))
    .filter((reason) => reason === 'overlap' || reason === 'rule');
  if (reasons.length === 0) return 'shifts_full';
  const rules = reasons.filter((reason) => reason === 'rule').length;
  return rules >= reasons.length - rules ? 'rules' : 'busy';
}

/** Rule kinds the solver treats as hard; the others only weigh. */
export const HARD_RULE_KINDS: readonly PlanningRuleKind[] = [
  'not_team',
  'only_team',
  'never_together',
  'max_shifts',
  'not_before',
  'not_after',
];
