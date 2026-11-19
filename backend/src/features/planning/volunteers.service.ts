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
import type { AssignmentRow, EventRow, VolunteerRow } from '../../db/schema/index.js';
import { checkPlacement } from './planning-rules.js';
import {
  APPLICATION_LOGGED_VALUES,
  ASSIGNMENT_LOGGED_VALUES,
  assertKnownShifts,
  assertKnownTeam,
  assertWritable,
  rethrowUnique,
} from './planning.mappers.js';
import { PlanningRepository, type ApplicationView } from './planning.repository.js';
import type {
  CreateApplicationInput,
  CreateAssignmentInput,
  MoveAssignmentInput,
  UpdateApplicationInput,
} from './planning.schemas.js';

const EMAIL_TAKEN = 'email: another volunteer already has this email address';
const ALREADY_APPLIED = 'This volunteer is already on the list for this event';

/**
 * What organizers do with volunteers on the board: add and edit applications by hand, remove
 * them, and place, move, confirm and unassign. Returns nothing: the board reloads.
 */
@Injectable()
export class VolunteersService {
  constructor(
    @InjectDrizzle() private readonly db: Database,
    private readonly planning: PlanningRepository,
  ) {}

  // ── Applications ─────────────────────────────────────────────────────────────────────────────

  /** Someone the organizer adds: an existing volunteer when the email is known. */
  async createApplication(
    org: OrgContext,
    event: EventRow,
    input: CreateApplicationInput,
  ): Promise<{ id: string }> {
    assertWritable(event);
    const { shiftIds } = await this.validateChoices(event, input);
    return this.db
      .transaction(async (tx) => {
        const known = input.email
          ? await this.planning.findVolunteerByEmail(tx, org.organizationId, input.email)
          : undefined;
        const person = known ?? (await this.insertVolunteer(tx, org, event, input));
        if (await this.planning.findApplicationOfVolunteer(tx, event.id, person.id)) {
          throw new ConflictException(ALREADY_APPLIED);
        }
        const created = await this.planning.insertApplication(tx, {
          eventId: event.id,
          volunteerId: person.id,
          source: 'manual',
          availableShiftIds: shiftIds ?? [],
          wholeEvent: input.wholeEvent ?? false,
          preferredTeamId: input.preferredTeamId ?? null,
          notes: input.notes || null,
          consentedAt: null,
        });
        await recordActivity(tx, org, {
          action: 'created',
          entityType: 'volunteer_application',
          entity: created,
          before: null,
          eventId: event.id,
          values: APPLICATION_LOGGED_VALUES,
        });
        return { id: created.id };
      })
      .catch((error: unknown) =>
        rethrowUnique(error, 'volunteer_application_event_volunteer_uidx', ALREADY_APPLIED),
      );
  }

  private async insertVolunteer(
    tx: Transaction,
    org: OrgContext,
    event: EventRow,
    input: Pick<CreateApplicationInput, 'name' | 'email' | 'phone'>,
  ): Promise<VolunteerRow> {
    const created = await this.planning
      .insertVolunteer(tx, {
        organizationId: org.organizationId,
        name: input.name,
        email: input.email || null,
        phone: input.phone || null,
      })
      .catch((error: unknown) =>
        rethrowUnique(error, 'volunteer_organization_email_uidx', EMAIL_TAKEN),
      );
    await recordActivity(tx, org, {
      action: 'created',
      entityType: 'volunteer',
      entity: created,
      before: null,
      eventId: event.id,
    });
    return created;
  }

  /** The organizer corrects the person's details or their choices. */
  async updateApplication(
    org: OrgContext,
    event: EventRow,
    applicationId: string,
    input: UpdateApplicationInput,
  ): Promise<void> {
    assertWritable(event);
    const current = await this.findApplication(event.id, applicationId);
    const { shiftIds } = await this.validateChoices(event, input);
    await this.db.transaction(async (tx) => {
      const person = {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.email !== undefined && { email: input.email || null }),
        ...(input.phone !== undefined && { phone: input.phone || null }),
      };
      if (Object.keys(person).length > 0) {
        const before = await this.planning.findVolunteer(
          tx,
          org.organizationId,
          current.volunteerId,
        );
        const updated = await this.planning
          .updateVolunteer(tx, current.volunteerId, person)
          .catch((error: unknown) =>
            rethrowUnique(error, 'volunteer_organization_email_uidx', EMAIL_TAKEN),
          );
        await recordActivity(tx, org, {
          action: 'updated',
          entityType: 'volunteer',
          entity: updated,
          before: before ?? null,
          eventId: event.id,
        });
      }
      const choices = {
        ...(shiftIds !== undefined && { availableShiftIds: shiftIds }),
        ...(input.wholeEvent !== undefined && { wholeEvent: input.wholeEvent }),
        ...(input.preferredTeamId !== undefined && { preferredTeamId: input.preferredTeamId }),
        ...(input.notes !== undefined && { notes: input.notes || null }),
      };
      if (Object.keys(choices).length > 0) {
        const updated = await this.planning.updateApplication(tx, current.id, choices);
        await recordActivity(tx, org, {
          action: 'updated',
          entityType: 'volunteer_application',
          entity: updated,
          before: current,
          eventId: event.id,
          values: APPLICATION_LOGGED_VALUES,
        });
      }
    });
  }

  /** Takes the volunteer off this event's list, with their assignments. The volunteer stays. */
  async removeApplication(
    org: OrgContext,
    event: EventRow,
    applicationId: string,
    confirmed: boolean,
  ): Promise<void> {
    assertWritable(event);
    const current = await this.findApplication(event.id, applicationId);
    // Someone who was emailed their shifts would otherwise never hear they're off: take them off
    // their shifts and tell them (notify) first.
    if (current.notifiedSchedule && current.notifiedSchedule.length > 0) {
      throw new ConflictException('This volunteer was emailed their shifts: tell them first');
    }
    await this.db.transaction(async (tx) => {
      const assignments = (await this.planning.listAssignments(event.id, tx)).filter(
        (a) => a.applicationId === current.id,
      );
      if (!confirmed && assignments.some((a) => a.status === 'confirmed')) {
        throw new ConflictException('Confirmed assignments would be removed: confirm first');
      }
      await this.logRemovedAssignments(tx, org, event, assignments);
      const removed = await this.planning.updateApplication(tx, current.id, {
        deletedAt: new Date(),
      });
      await recordActivity(tx, org, {
        action: 'deleted',
        entityType: 'volunteer_application',
        entity: removed,
        eventId: event.id,
      });
    });
  }

  private async validateChoices(
    event: EventRow,
    input: Pick<UpdateApplicationInput, 'availableShiftIds' | 'preferredTeamId'>,
  ) {
    const [shifts, teams] = await Promise.all([
      this.planning.listShifts(event.id),
      this.planning.listTeams(event.id),
    ]);
    assertKnownTeam(input.preferredTeamId, teams);
    const shiftIds =
      input.availableShiftIds === undefined
        ? undefined
        : assertKnownShifts(input.availableShiftIds, shifts);
    return { shiftIds };
  }

  private async findApplication(eventId: string, applicationId: string): Promise<ApplicationView> {
    const row = await this.planning.findApplication(eventId, applicationId);
    if (!row) throw new NotFoundException('Volunteer not found');
    return row;
  }

  // ── Assignments ──────────────────────────────────────────────────────────────────────────────

  /**
   * Places a volunteer on a shift, as a proposal. Refused when it clashes with another of their
   * shifts; a full shift or one they didn't mark needs `acknowledgeWarnings`.
   */
  async assign(org: OrgContext, event: EventRow, input: CreateAssignmentInput): Promise<void> {
    assertWritable(event);
    await this.db
      .transaction(async (tx) => {
        await this.planning.lockEvent(tx, event.id);
        const application = await this.planning.findApplication(event.id, input.applicationId, tx);
        if (!application) throw new BadRequestException('applicationId: volunteer not found');
        const all = await this.planning.listAssignments(event.id, tx);
        if (all.some((a) => a.applicationId === application.id && a.shiftId === input.shiftId)) {
          throw new ConflictException('The volunteer is already on this shift');
        }
        await this.assertPlacement(tx, event, application, input.shiftId, all, null, input);
        const created = await this.planning.insertAssignment(tx, {
          applicationId: application.id,
          shiftId: input.shiftId,
          assignedByUserId: org.userId,
        });
        await recordActivity(tx, org, {
          action: 'created',
          entityType: 'assignment',
          entity: created,
          before: null,
          eventId: event.id,
          values: ASSIGNMENT_LOGGED_VALUES,
        });
      })
      .catch((error: unknown) =>
        rethrowUnique(
          error,
          'assignment_application_shift_uidx',
          'The volunteer is already on this shift',
        ),
      );
  }

  /** Moves an assignment to another shift; it keeps its status. Same checks as placing. */
  async move(
    org: OrgContext,
    event: EventRow,
    assignmentId: string,
    input: MoveAssignmentInput,
  ): Promise<void> {
    assertWritable(event);
    await this.db
      .transaction(async (tx) => {
        await this.planning.lockEvent(tx, event.id);
        const all = await this.planning.listAssignments(event.id, tx);
        const current = all.find((a) => a.id === assignmentId);
        if (!current) throw new NotFoundException('Assignment not found');
        if (current.shiftId === input.shiftId) return;
        if (
          all.some((a) => a.applicationId === current.applicationId && a.shiftId === input.shiftId)
        ) {
          throw new ConflictException('The volunteer is already on this shift');
        }
        const application = await this.planning.findApplication(
          event.id,
          current.applicationId,
          tx,
        );
        await this.assertPlacement(tx, event, application!, input.shiftId, all, current.id, input);
        const moved = await this.planning.updateAssignment(tx, current.id, {
          shiftId: input.shiftId,
          assignedByUserId: org.userId,
        });
        await recordActivity(tx, org, {
          action: 'moved',
          entityType: 'assignment',
          entity: moved,
          before: current,
          eventId: event.id,
          values: ASSIGNMENT_LOGGED_VALUES,
        });
      })
      .catch((error: unknown) =>
        rethrowUnique(
          error,
          'assignment_application_shift_uidx',
          'The volunteer is already on this shift',
        ),
      );
  }

  private async assertPlacement(
    tx: Transaction,
    event: EventRow,
    application: ApplicationView,
    shiftId: string,
    all: AssignmentRow[],
    movingId: string | null,
    input: { acknowledgeWarnings?: boolean },
  ) {
    const shifts = await this.planning.listShifts(event.id, tx);
    const target = shifts.find((s) => s.id === shiftId);
    if (!target) throw new BadRequestException('shiftId: shift not found');
    const shiftById = new Map(shifts.map((s) => [s.id, s]));
    const check = checkPlacement({
      target,
      assignedCount: all.filter((a) => a.shiftId === target.id && a.id !== movingId).length,
      otherShifts: all
        .filter((a) => a.applicationId === application.id && a.id !== movingId)
        .map((a) => shiftById.get(a.shiftId))
        .filter((s) => s !== undefined),
      application,
    });
    if (check.overlapsWith) {
      throw new ConflictException(`overlap: ${check.overlapsWith}`);
    }
    if (check.warnings.length > 0 && !input.acknowledgeWarnings) {
      throw new ConflictException(`warnings: ${check.warnings.join(',')}`);
    }
  }

  async confirm(org: OrgContext, event: EventRow, assignmentId: string): Promise<void> {
    assertWritable(event);
    await this.db.transaction(async (tx) => {
      const current = await this.planning.findAssignment(event.id, assignmentId, tx);
      if (!current) throw new NotFoundException('Assignment not found');
      if (current.status === 'confirmed') return;
      const [updated] = await this.planning.setAssignmentsStatus(tx, [current.id], 'confirmed');
      await recordActivity(tx, org, {
        action: 'confirmed',
        entityType: 'assignment',
        entity: updated!,
        before: current,
        eventId: event.id,
        values: ASSIGNMENT_LOGGED_VALUES,
      });
    });
  }

  /** Confirms every proposed assignment of the event. */
  async confirmAll(org: OrgContext, event: EventRow): Promise<{ confirmed: number }> {
    assertWritable(event);
    return this.db.transaction(async (tx) => {
      const proposed = (await this.planning.listAssignments(event.id, tx)).filter(
        (a) => a.status === 'proposed',
      );
      const updated = await this.planning.setAssignmentsStatus(
        tx,
        proposed.map((a) => a.id),
        'confirmed',
      );
      for (const row of updated) {
        await recordActivity(tx, org, {
          action: 'confirmed',
          entityType: 'assignment',
          entity: row,
          before: proposed.find((a) => a.id === row.id)!,
          eventId: event.id,
          values: ASSIGNMENT_LOGGED_VALUES,
        });
      }
      return { confirmed: updated.length };
    });
  }

  async unassign(org: OrgContext, event: EventRow, assignmentId: string): Promise<void> {
    assertWritable(event);
    await this.db.transaction(async (tx) => {
      const current = await this.planning.findAssignment(event.id, assignmentId, tx);
      if (!current) throw new NotFoundException('Assignment not found');
      await this.logRemovedAssignments(tx, org, event, [current]);
    });
  }

  private async logRemovedAssignments(
    tx: Transaction,
    org: OrgContext,
    event: EventRow,
    assignments: AssignmentRow[],
  ) {
    const removed = await this.planning.softDeleteAssignments(
      tx,
      assignments.map((a) => a.id),
    );
    for (const row of removed) {
      await recordActivity(tx, org, {
        action: 'deleted',
        entityType: 'assignment',
        entity: row,
        eventId: event.id,
        values: ASSIGNMENT_LOGGED_VALUES,
      });
    }
  }
}
