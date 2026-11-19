import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { recordActivity } from '../../activity/activity-log.js';
import type { OrgContext } from '../../authz/org-context.js';
import type { Database, Transaction } from '../../db/database.js';
import type { EventRow, ShiftRow } from '../../db/schema/index.js';
import { toEventDto } from '../events/events.service.js';
import type { EventDto } from '../events/events.schemas.js';
import {
  fitsWindow,
  publicSlug,
  registrationClosedReason,
  scheduleNotice,
  shiftWindow,
} from './planning-rules.js';
import {
  APPLICATION_LOGGED_VALUES,
  ASSIGNMENT_LOGGED_VALUES,
  assertWritable,
  assignmentIssues,
  confirmedSchedule,
  REGISTRATION_LOGGED_VALUES,
  rethrowUnique,
  SHIFT_LOGGED_VALUES,
  TEAM_LOGGED_VALUES,
  toApplicationDto,
  toAssignmentDto,
  toShiftDto,
  toTeamDto,
} from './planning.mappers.js';
import { PlanningRepository } from './planning.repository.js';
import type {
  CreateShiftInput,
  CreateTeamInput,
  PlanningDto,
  ShiftDto,
  TeamDto,
  UpdateRegistrationInput,
  UpdateShiftInput,
  UpdateTeamInput,
} from './planning.schemas.js';

const TEAM_NAME_TAKEN = 'name: a team with this name already exists';

/**
 * The planning board, an event's teams and shifts, and its registration settings. Routes have
 * already authorized the event ('read' for the board, 'manage' for every write). Every write
 * runs in a transaction and logs in it.
 */
@Injectable()
export class PlanningService {
  constructor(
    @InjectDrizzle() private readonly db: Database,
    private readonly planning: PlanningRepository,
  ) {}

  /** Everything the board shows, with coverage and the issues to flag. */
  async board(event: EventRow): Promise<PlanningDto> {
    const [teams, shifts, applications, assignments] = await Promise.all([
      this.planning.listTeams(event.id),
      this.planning.listShifts(event.id),
      this.planning.listApplications(event.id),
      this.planning.listAssignments(event.id),
    ]);
    const issues = assignmentIssues(shifts, applications, assignments);
    const assignmentDtos = assignments.map((a) => toAssignmentDto(a, issues.get(a.id) ?? []));
    const liveShiftIds = new Set(shifts.map((s) => s.id));
    const window = shiftWindow(event);

    // After the one-time send, changed volunteers are told one by one.
    const pending = new Map(
      applications.map((application) => {
        const notice = event.schedulePublishedAt
          ? scheduleNotice(
              confirmedSchedule(application.id, shifts, teams, assignments),
              application.notifiedSchedule,
              false,
            )
          : null;
        return [application.id, notice === 'not_needed' ? null : notice] as const;
      }),
    );
    const unpublishedChanges = [...pending.values()].filter((notice) => notice !== null).length;

    return {
      window: { startsAt: window.startsAt.toISOString(), endsAt: window.endsAt.toISOString() },
      teams: teams.map(toTeamDto),
      shifts: shifts.map((s) => toShiftDto(s, assignments)),
      applications: applications.map((a) =>
        toApplicationDto(a, liveShiftIds, assignmentDtos, pending.get(a.id) ?? null),
      ),
      unpublishedChanges,
      registrationClosedReason: registrationClosedReason(event, new Date()),
    };
  }

  // ── Teams ────────────────────────────────────────────────────────────────────────────────────

  async createTeam(org: OrgContext, event: EventRow, input: CreateTeamInput): Promise<TeamDto> {
    assertWritable(event);
    const row = await this.db
      .transaction(async (tx) => {
        const created = await this.planning.insertTeam(tx, {
          eventId: event.id,
          name: input.name,
          description: input.description || null,
          defaultMeetingPoint: input.defaultMeetingPoint || null,
        });
        await recordActivity(tx, org, {
          action: 'created',
          entityType: 'team',
          entity: created,
          before: null,
          eventId: event.id,
          values: TEAM_LOGGED_VALUES,
        });
        return created;
      })
      .catch((error: unknown) => rethrowUnique(error, 'team_event_name_uidx', TEAM_NAME_TAKEN));
    return toTeamDto(row);
  }

  async updateTeam(
    org: OrgContext,
    event: EventRow,
    teamId: string,
    input: UpdateTeamInput,
  ): Promise<TeamDto> {
    assertWritable(event);
    const current = await this.findTeam(event.id, teamId);
    const patch = {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description || null }),
      ...(input.defaultMeetingPoint !== undefined && {
        defaultMeetingPoint: input.defaultMeetingPoint || null,
      }),
    };
    const row = await this.db
      .transaction(async (tx) => {
        const updated = await this.planning.updateTeam(tx, current.id, patch);
        await recordActivity(tx, org, {
          action: 'updated',
          entityType: 'team',
          entity: updated,
          before: current,
          eventId: event.id,
          values: TEAM_LOGGED_VALUES,
        });
        return updated;
      })
      .catch((error: unknown) => rethrowUnique(error, 'team_event_name_uidx', TEAM_NAME_TAKEN));
    return toTeamDto(row);
  }

  /**
   * Deletes the team with its shifts and their assignments, and clears it as anyone's preferred
   * team. With confirmed assignments on its shifts, the caller must have confirmed (`confirmed`).
   */
  async removeTeam(org: OrgContext, event: EventRow, teamId: string, confirmed: boolean) {
    assertWritable(event);
    const current = await this.findTeam(event.id, teamId);
    await this.db.transaction(async (tx) => {
      const shifts = (await this.planning.listShifts(event.id, tx)).filter(
        (s) => s.teamId === current.id,
      );
      await this.removeShiftsIn(tx, org, event, shifts, confirmed);
      const removed = await this.planning.softDeleteTeam(tx, current.id);
      await recordActivity(tx, org, {
        action: 'deleted',
        entityType: 'team',
        entity: removed,
        eventId: event.id,
      });
      for (const application of await this.planning.clearPreferredTeam(tx, current.id)) {
        await recordActivity(tx, org, {
          action: 'updated',
          entityType: 'volunteer_application',
          entity: application,
          before: { ...application, preferredTeamId: current.id },
          eventId: event.id,
          values: APPLICATION_LOGGED_VALUES,
        });
      }
    });
  }

  private async findTeam(eventId: string, teamId: string) {
    const row = await this.planning.findTeam(eventId, teamId);
    if (!row) throw new NotFoundException('Team not found');
    return row;
  }

  // ── Shifts ───────────────────────────────────────────────────────────────────────────────────

  async createShift(org: OrgContext, event: EventRow, input: CreateShiftInput): Promise<ShiftDto> {
    assertWritable(event);
    const team = await this.planning.findTeam(event.id, input.teamId);
    if (!team) throw new BadRequestException('teamId: team not found');
    assertInWindow(event, input);
    const row = await this.db.transaction(async (tx) => {
      const created = await this.planning.insertShift(tx, {
        eventId: event.id,
        teamId: team.id,
        // Empty means: the team's default meeting point.
        meetingPoint: input.meetingPoint || team.defaultMeetingPoint,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        capacity: input.capacity,
      });
      await recordActivity(tx, org, {
        action: 'created',
        entityType: 'shift',
        entity: created,
        before: null,
        eventId: event.id,
        values: SHIFT_LOGGED_VALUES,
      });
      return created;
    });
    return toShiftDto(row, []);
  }

  /**
   * Saves even when assignments no longer fit (fewer places, a new time that clashes or that
   * volunteers didn't mark): the board flags them, the organizer decides.
   */
  async updateShift(
    org: OrgContext,
    event: EventRow,
    shiftId: string,
    input: UpdateShiftInput,
  ): Promise<ShiftDto> {
    assertWritable(event);
    const current = await this.planning.findShift(event.id, shiftId);
    if (!current) throw new NotFoundException('Shift not found');
    if (input.teamId && !(await this.planning.findTeam(event.id, input.teamId))) {
      throw new BadRequestException('teamId: team not found');
    }
    const next = {
      startsAt: input.startsAt ?? current.startsAt,
      endsAt: input.endsAt ?? current.endsAt,
    };
    if (next.endsAt <= next.startsAt)
      throw new BadRequestException('endsAt must be after startsAt');
    assertInWindow(event, next);

    const patch: Partial<ShiftRow> = {
      ...(input.teamId !== undefined && { teamId: input.teamId }),
      ...(input.meetingPoint !== undefined && { meetingPoint: input.meetingPoint || null }),
      ...(input.startsAt !== undefined && { startsAt: input.startsAt }),
      ...(input.endsAt !== undefined && { endsAt: input.endsAt }),
      ...(input.capacity !== undefined && { capacity: input.capacity }),
    };
    const row = await this.db.transaction(async (tx) => {
      const updated = await this.planning.updateShift(tx, current.id, patch);
      await recordActivity(tx, org, {
        action: 'updated',
        entityType: 'shift',
        entity: updated,
        before: current,
        eventId: event.id,
        values: SHIFT_LOGGED_VALUES,
      });
      return updated;
    });
    return toShiftDto(row, await this.planning.listAssignments(event.id));
  }

  async removeShift(org: OrgContext, event: EventRow, shiftId: string, confirmed: boolean) {
    assertWritable(event);
    const current = await this.planning.findShift(event.id, shiftId);
    if (!current) throw new NotFoundException('Shift not found');
    await this.db.transaction((tx) => this.removeShiftsIn(tx, org, event, [current], confirmed));
  }

  /**
   * Deletes shifts with their assignments. Refuses (409) when a confirmed assignment would go and
   * the caller didn't confirm: those volunteers were told, or are about to be.
   */
  private async removeShiftsIn(
    tx: Transaction,
    org: OrgContext,
    event: EventRow,
    shifts: ShiftRow[],
    confirmed: boolean,
  ) {
    const ids = new Set(shifts.map((s) => s.id));
    const assignments = (await this.planning.listAssignments(event.id, tx)).filter((a) =>
      ids.has(a.shiftId),
    );
    if (!confirmed && assignments.some((a) => a.status === 'confirmed')) {
      throw new ConflictException('Confirmed assignments would be removed: confirm first');
    }
    for (const removed of await this.planning.softDeleteAssignments(
      tx,
      assignments.map((a) => a.id),
    )) {
      await recordActivity(tx, org, {
        action: 'deleted',
        entityType: 'assignment',
        entity: removed,
        eventId: event.id,
        values: ASSIGNMENT_LOGGED_VALUES,
      });
    }
    for (const removed of await this.planning.softDeleteShifts(tx, [...ids])) {
      await recordActivity(tx, org, {
        action: 'deleted',
        entityType: 'shift',
        entity: removed,
        eventId: event.id,
      });
    }
  }

  // ── Registration settings ────────────────────────────────────────────────────────────────────

  /** Opening registration the first time gives the event its public link. */
  async updateRegistration(
    org: OrgContext,
    event: EventRow,
    input: UpdateRegistrationInput,
  ): Promise<EventDto> {
    assertWritable(event);
    const needsSlug = input.registrationOpen === true && !event.publicSlug;
    const row = await this.db
      .transaction(async (tx) => {
        const updated = await this.planning.updateEvent(tx, event.id, {
          ...input,
          ...(needsSlug && { publicSlug: publicSlug(event.name, randomSuffix()) }),
        });
        await recordActivity(tx, org, {
          action: 'registration_updated',
          entityType: 'event',
          entity: updated,
          before: event,
          eventId: event.id,
          values: REGISTRATION_LOGGED_VALUES,
        });
        return updated;
      })
      // Two events with the same name and suffix: vanishingly rare, and trying again fixes it.
      .catch((error: unknown) =>
        rethrowUnique(error, 'event_public_slug_uidx', 'Could not create a link, try again'),
      );
    return toEventDto(row);
  }
}

/** Shifts must fall within the event, its setup and teardown included. */
function assertInWindow(event: EventRow, slot: { startsAt: Date; endsAt: Date }) {
  if (!fitsWindow(slot, shiftWindow(event))) {
    throw new BadRequestException('startsAt: the shift must fall within the event');
  }
}

/** Four lowercase letters and digits. */
function randomSuffix(): string {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789';
  return [...randomBytes(4)].map((byte) => alphabet[byte % alphabet.length]).join('');
}
