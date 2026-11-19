import type { Application, Planning, Shift } from '@/api/generated/types.gen';
import { utcIsoToBrussels } from '@/lib/format';

/**
 * Board rules, mirroring backend/src/features/planning/planning-rules.ts so the board can warn
 * before a drop instead of after a failed request. The backend checks everything again.
 */

type Slot = Pick<Shift, 'startsAt' | 'endsAt'>;

/** Back-to-back shifts (18:00–21:00, 21:00–23:00) don't overlap. */
export const overlaps = (a: Slot, b: Slot) => a.startsAt < b.endsAt && b.startsAt < a.endsAt;

export const isAvailable = (
  application: Pick<Application, 'wholeEvent' | 'availableShiftIds'>,
  shiftId: string,
) => application.wholeEvent || application.availableShiftIds.includes(shiftId);

export type PlacementWarning = 'over_capacity' | 'not_available';

export interface Placement {
  /** Another shift of the volunteer at the same time: the drop is refused. */
  clash: Shift | null;
  warnings: PlacementWarning[];
}

/**
 * What putting `application` on `target` means. `movingAssignmentId`: the assignment being moved
 * there, which no longer counts on its old shift.
 */
export function checkPlacement(
  planning: Pick<Planning, 'shifts' | 'applications'>,
  application: Application,
  target: Shift,
  movingAssignmentId: string | null = null,
): Placement {
  const others = application.assignments.filter((a) => a.id !== movingAssignmentId);
  const shiftById = new Map(planning.shifts.map((s) => [s.id, s]));
  const clash =
    others
      .map((a) => shiftById.get(a.shiftId))
      .find((s): s is Shift => !!s && s.id !== target.id && overlaps(s, target)) ?? null;

  const onTarget = planning.applications
    .flatMap((a) => a.assignments)
    .filter((a) => a.shiftId === target.id && a.id !== movingAssignmentId).length;
  const warnings: PlacementWarning[] = [];
  if (onTarget + 1 > target.capacity) warnings.push('over_capacity');
  if (!isAvailable(application, target.id)) warnings.push('not_available');
  return { clash, warnings };
}

export type Coverage = 'empty' | 'partial' | 'full' | 'over';

/** Unfilled shifts are red, full ones green, overfull ones amber. */
export function coverage(assigned: number, capacity: number): Coverage {
  if (assigned > capacity) return 'over';
  if (assigned === capacity) return 'full';
  return assigned === 0 ? 'empty' : 'partial';
}

/** A team's total: people on its shifts (capped per shift, so overfull ones don't hide gaps). */
export function teamCoverage(shifts: Pick<Shift, 'assignedCount' | 'capacity'>[]) {
  return {
    filled: shifts.reduce((sum, s) => sum + Math.min(s.assignedCount, s.capacity), 0),
    capacity: shifts.reduce((sum, s) => sum + s.capacity, 0),
  };
}

/** The Brussels day a shift belongs to: the day it starts. */
export const shiftDay = (shift: Pick<Shift, 'startsAt'>) => utcIsoToBrussels(shift.startsAt).date;

/** Every day with at least one shift, in order. */
export const shiftDays = (shifts: Pick<Shift, 'startsAt'>[]) =>
  [...new Set(shifts.map(shiftDay))].sort();

/**
 * How many shifts a volunteer still needs: null when the event asks for the whole event (then
 * any number is fine).
 */
export function shiftsNeeded(
  application: Pick<Application, 'assignments'>,
  event: { volunteerCommitment: 'shifts' | 'whole_event'; shiftsPerVolunteer: number },
): number | null {
  if (event.volunteerCommitment === 'whole_event') return null;
  return Math.max(0, event.shiftsPerVolunteer - application.assignments.length);
}

/** Who still needs shifts first, then the rest; alphabetical within each group. */
export function sortVolunteers(
  applications: Application[],
  event: { volunteerCommitment: 'shifts' | 'whole_event'; shiftsPerVolunteer: number },
): Application[] {
  const done = (a: Application) => {
    const needed = shiftsNeeded(a, event);
    return needed === null ? a.assignments.length > 0 : needed === 0;
  };
  return [...applications].sort(
    (a, b) => Number(done(a)) - Number(done(b)) || a.name.localeCompare(b.name, 'nl'),
  );
}

export interface VolunteerFilters {
  search: string;
  /** A team id, 'none' (no preference) or 'all'. */
  teamId: string;
}

export function filterVolunteers(applications: Application[], filters: VolunteerFilters) {
  const search = filters.search.trim().toLocaleLowerCase('nl');
  return applications.filter((a) => {
    if (search && !a.name.toLocaleLowerCase('nl').includes(search)) return false;
    if (filters.teamId === 'none') return a.preferredTeamId === null;
    if (filters.teamId !== 'all') return a.preferredTeamId === filters.teamId;
    return true;
  });
}

export interface PublishReadiness {
  /** Places on shifts nobody fills yet. */
  openSpots: number;
  /** Assignments still a proposal: publishing skips them. */
  proposed: number;
  /** Every shift is full and every assignment confirmed: time to send. */
  ready: boolean;
}

/**
 * Whether the schedule is complete enough to send. Sending is meant to happen once, when the
 * planning is done; later changes go out as updates.
 */
export function publishReadiness(
  planning: Pick<Planning, 'shifts' | 'applications'>,
): PublishReadiness {
  const { filled, capacity } = teamCoverage(planning.shifts);
  const openSpots = capacity - filled;
  const proposed = planning.applications
    .flatMap((a) => a.assignments)
    .filter((a) => a.status === 'proposed').length;
  return {
    openSpots,
    proposed,
    ready: planning.shifts.length > 0 && openSpots === 0 && proposed === 0,
  };
}
