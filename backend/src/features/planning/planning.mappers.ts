import { BadRequestException, ConflictException } from '@nestjs/common';
import type {
  AssignmentRow,
  EventRow,
  ScheduleEntry,
  ShiftRow,
  TeamRow,
} from '../../db/schema/index.js';
import { isReadOnly } from '../events/event-status.js';
import { isAvailable, overlaps } from './planning-rules.js';
import type { ApplicationView } from './planning.repository.js';
import type {
  ApplicationDto,
  AssignmentDto,
  AssignmentIssue,
  ShiftDto,
  TeamDto,
} from './planning.schemas.js';

/**
 * Shared pieces of the planning services: what the activity log may keep, DTO mapping, and the
 * issues the board flags on assignments.
 */

/** Team names and meeting points are categories and places, not personal data. */
export const TEAM_LOGGED_VALUES = ['name', 'defaultMeetingPoint'] as const;
export const SHIFT_LOGGED_VALUES = [
  'teamId',
  'meetingPoint',
  'startsAt',
  'endsAt',
  'capacity',
] as const;
/** Never the volunteer's name, email, phone or notes: ids, choices and dates only. */
export const APPLICATION_LOGGED_VALUES = [
  'volunteerId',
  'source',
  'availableShiftIds',
  'wholeEvent',
  'preferredTeamId',
  'consentedAt',
] as const;
export const ASSIGNMENT_LOGGED_VALUES = [
  'applicationId',
  'shiftId',
  'status',
  'assignedByUserId',
] as const;
export const REGISTRATION_LOGGED_VALUES = [
  'registrationOpen',
  'registrationDeadline',
  'volunteerCommitment',
  'shiftsPerVolunteer',
  'publicSlug',
  'schedulePublishedAt',
] as const;

export function assertWritable(event: EventRow): void {
  if (isReadOnly(event.status)) {
    throw new ConflictException('An archived event cannot be changed');
  }
}

/** Whether the error is a violation of the given unique index. */
export function isUniqueViolation(error: unknown, constraint: string): boolean {
  // Drizzle wraps the driver error: the Postgres code and constraint are on its cause.
  const cause: unknown = error instanceof Error ? (error.cause ?? error) : error;
  return (
    typeof cause === 'object' &&
    cause !== null &&
    'code' in cause &&
    cause.code === '23505' &&
    'constraint' in cause &&
    cause.constraint === constraint
  );
}

/** Turns a violation of the given unique index into a 409; rethrows anything else. */
export function rethrowUnique(error: unknown, constraint: string, message: string): never {
  if (isUniqueViolation(error, constraint)) throw new ConflictException(message);
  throw error;
}

/** Checks every id is one of the event's live shifts. Messages start with the field. */
export function assertKnownShifts(shiftIds: string[], shifts: Pick<ShiftRow, 'id'>[]): string[] {
  const known = new Set(shifts.map((s) => s.id));
  const unique = [...new Set(shiftIds)];
  if (unique.some((id) => !known.has(id))) {
    throw new BadRequestException('availableShiftIds: unknown shift');
  }
  return unique;
}

export function assertKnownTeam(teamId: string | null | undefined, teams: Pick<TeamRow, 'id'>[]) {
  if (teamId && !teams.some((t) => t.id === teamId)) {
    throw new BadRequestException('preferredTeamId: unknown team');
  }
}

export const toTeamDto = (row: TeamRow): TeamDto => ({
  id: row.id,
  eventId: row.eventId,
  name: row.name,
  description: row.description,
  defaultMeetingPoint: row.defaultMeetingPoint,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

export function toShiftDto(row: ShiftRow, assignments: AssignmentRow[]): ShiftDto {
  const own = assignments.filter((a) => a.shiftId === row.id);
  return {
    id: row.id,
    eventId: row.eventId,
    teamId: row.teamId,
    meetingPoint: row.meetingPoint,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    capacity: row.capacity,
    assignedCount: own.length,
    confirmedCount: own.filter((a) => a.status === 'confirmed').length,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * The problems of each assignment, for the board's amber flags:
 * - over_capacity: placed after the shift was already full (the first `capacity` are fine).
 * - not_available: the volunteer didn't mark the shift as available.
 * - overlap: the volunteer has another shift at the same time (possible after a shift was moved).
 */
export function assignmentIssues(
  shifts: ShiftRow[],
  applications: Pick<ApplicationView, 'id' | 'wholeEvent' | 'availableShiftIds'>[],
  assignments: AssignmentRow[],
): Map<string, AssignmentIssue[]> {
  const shiftById = new Map(shifts.map((s) => [s.id, s]));
  const applicationById = new Map(applications.map((a) => [a.id, a]));
  const issues = new Map<string, AssignmentIssue[]>();

  for (const current of assignments) {
    const own: AssignmentIssue[] = [];
    const target = shiftById.get(current.shiftId);
    const application = applicationById.get(current.applicationId);
    if (!target || !application) continue;

    const onShift = assignments.filter((a) => a.shiftId === current.shiftId);
    if (onShift.indexOf(current) >= target.capacity) own.push('over_capacity');
    if (!isAvailable(application, target.id)) own.push('not_available');
    const clash = assignments.some((other) => {
      if (other.id === current.id || other.applicationId !== current.applicationId) return false;
      const otherShift = shiftById.get(other.shiftId);
      return otherShift !== undefined && overlaps(otherShift, target);
    });
    if (clash) own.push('overlap');
    issues.set(current.id, own);
  }
  return issues;
}

export const toAssignmentDto = (row: AssignmentRow, issues: AssignmentIssue[]): AssignmentDto => ({
  id: row.id,
  applicationId: row.applicationId,
  shiftId: row.shiftId,
  status: row.status,
  assignedByUserId: row.assignedByUserId,
  issues,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

/** Ids of shifts deleted after the volunteer marked them are left out. */
export function toApplicationDto(
  row: ApplicationView,
  liveShiftIds: Set<string>,
  assignments: AssignmentDto[],
  pendingNotice: ApplicationDto['pendingNotice'] = null,
): ApplicationDto {
  return {
    id: row.id,
    eventId: row.eventId,
    volunteerId: row.volunteerId,
    name: row.name,
    email: row.email,
    phone: row.phone,
    source: row.source,
    availableShiftIds: row.availableShiftIds.filter((id) => liveShiftIds.has(id)),
    wholeEvent: row.wholeEvent,
    preferredTeamId: row.preferredTeamId,
    notes: row.notes,
    consentedAt: row.consentedAt?.toISOString() ?? null,
    assignments: assignments.filter((a) => a.applicationId === row.id),
    pendingNotice,
    hasSentSchedule: (row.notifiedSchedule?.length ?? 0) > 0,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** A volunteer's confirmed shifts, as they would be emailed. */
export function confirmedSchedule(
  applicationId: string,
  shifts: ShiftRow[],
  teams: TeamRow[],
  assignments: AssignmentRow[],
): ScheduleEntry[] {
  const teamName = new Map(teams.map((t) => [t.id, t.name]));
  const shiftById = new Map(shifts.map((s) => [s.id, s]));
  return assignments
    .filter((a) => a.applicationId === applicationId && a.status === 'confirmed')
    .map((a) => shiftById.get(a.shiftId))
    .filter((s): s is ShiftRow => s !== undefined)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
    .map((s) => ({
      shiftId: s.id,
      teamName: teamName.get(s.teamId) ?? '',
      startsAt: s.startsAt.toISOString(),
      endsAt: s.endsAt.toISOString(),
      meetingPoint: s.meetingPoint,
    }));
}
