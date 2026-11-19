import type { EventRow, ScheduleEntry, ShiftRow } from '../../db/schema/index.js';

/**
 * Pure planning rules: when shifts may happen, which assignments are a problem, and who has to be
 * emailed when the schedule is published. No database, so they are unit-tested on their own.
 *
 * What blocks and what only warns (decided November 2026):
 * - Blocked: a volunteer on two shifts that overlap in time; a shift outside the event's window.
 * - Warned, and allowed after confirming: more people than the shift's capacity, and a volunteer
 *   on a shift they didn't mark as available.
 */

type Window = { startsAt: Date; endsAt: Date };
type EventWindow = Pick<EventRow, 'startsAt' | 'endsAt' | 'setupStartsAt' | 'teardownEndsAt'>;

/** When shifts may happen: from setup (else the start) to teardown (else the end). */
export function shiftWindow(event: EventWindow): Window {
  return {
    startsAt: event.setupStartsAt ?? event.startsAt,
    endsAt: event.teardownEndsAt ?? event.endsAt,
  };
}

export const fitsWindow = (slot: Window, window: Window) =>
  slot.startsAt >= window.startsAt && slot.endsAt <= window.endsAt;

/** Two time slots overlap when one starts before the other ends. Touching (18:00–21:00, 21:00–…) is fine. */
export const overlaps = (a: Window, b: Window) => a.startsAt < b.endsAt && b.startsAt < a.endsAt;

/** The shifts that would fall outside `window`, e.g. when the event's dates are changed. */
export const shiftsOutside = <S extends Window>(shifts: S[], window: Window): S[] =>
  shifts.filter((shift) => !fitsWindow(shift, window));

/** Why placing a volunteer on a shift needs a confirmation first. */
export type AssignmentWarning = 'over_capacity' | 'not_available';

export interface PlacementCheck {
  /** The other shift the volunteer already has at the same time: placing them is refused. */
  overlapsWith: string | null;
  warnings: AssignmentWarning[];
}

/**
 * What placing a volunteer on `target` would mean.
 * - `assignedCount`: people on the target shift now, not counting this volunteer.
 * - `otherShifts`: the volunteer's other assigned shifts (the one being moved away from excluded).
 */
export function checkPlacement(input: {
  target: Pick<ShiftRow, 'id' | 'startsAt' | 'endsAt' | 'capacity'>;
  assignedCount: number;
  otherShifts: Pick<ShiftRow, 'id' | 'startsAt' | 'endsAt'>[];
  application: { wholeEvent: boolean; availableShiftIds: string[] };
}): PlacementCheck {
  const clash = input.otherShifts.find(
    (other) => other.id !== input.target.id && overlaps(other, input.target),
  );
  const warnings: AssignmentWarning[] = [];
  if (input.assignedCount + 1 > input.target.capacity) warnings.push('over_capacity');
  if (!isAvailable(input.application, input.target.id)) warnings.push('not_available');
  return { overlapsWith: clash?.id ?? null, warnings };
}

export const isAvailable = (
  application: { wholeEvent: boolean; availableShiftIds: string[] },
  shiftId: string,
) => application.wholeEvent || application.availableShiftIds.includes(shiftId);

/**
 * How many shifts a volunteer must mark on the public form: the event's ask, but never more
 * than there are shifts.
 */
export const requiredShiftCount = (shiftsPerVolunteer: number, shiftCount: number) =>
  Math.min(shiftsPerVolunteer, shiftCount);

/** What a publish emails one volunteer, or null when their schedule didn't change. */
export type ScheduleNotice = 'schedule' | 'updated' | 'removed' | 'not_needed';

/**
 * Compares a volunteer's confirmed shifts with what they were last sent.
 * - `sent` null: never emailed. Empty: told they aren't needed (or that they were taken off).
 */
export function scheduleNotice(
  current: ScheduleEntry[],
  sent: ScheduleEntry[] | null,
  includeNotNeeded: boolean,
): ScheduleNotice | null {
  if (current.length === 0) {
    if (sent === null) return includeNotNeeded ? 'not_needed' : null;
    return sent.length > 0 ? 'removed' : null;
  }
  if (sent === null || sent.length === 0) return 'schedule';
  return sameSchedule(current, sent) ? null : 'updated';
}

export function sameSchedule(a: ScheduleEntry[], b: ScheduleEntry[]): boolean {
  const key = (entries: ScheduleEntry[]) =>
    JSON.stringify(
      [...entries]
        .sort((x, y) => x.shiftId.localeCompare(y.shiftId))
        .map((e) => [e.shiftId, e.teamName, e.startsAt, e.endsAt, e.meetingPoint]),
    );
  return key(a) === key(b);
}

/** Registration accepts sign-ups only when published, opened and before the deadline. */
export type RegistrationClosedReason = 'not_published' | 'not_open' | 'deadline_passed';

export function registrationClosedReason(
  event: Pick<EventRow, 'status' | 'registrationOpen' | 'registrationDeadline'>,
  now: Date,
): RegistrationClosedReason | null {
  if (event.status !== 'published') return 'not_published';
  if (!event.registrationOpen) return 'not_open';
  if (event.registrationDeadline && event.registrationDeadline <= now) return 'deadline_passed';
  return null;
}

/**
 * The public link's slug: the event name in lowercase ASCII with dashes, plus a random suffix so
 * links can't be guessed from the name ("Kerstmarkt 2026" → "kerstmarkt-2026-x7k2").
 */
export function publicSlug(name: string, suffix: string): string {
  const base = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  return base ? `${base}-${suffix}` : suffix;
}
