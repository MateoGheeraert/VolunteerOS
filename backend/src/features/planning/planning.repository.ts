import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { Database, DbExecutor } from '../../db/database.js';
import {
  assignment,
  event,
  organization,
  shift,
  team,
  user,
  volunteer,
  volunteerApplication,
  type AssignmentRow,
  type AssignmentStatus,
  type EventRow,
  type ScheduleEntry,
  type ShiftRow,
  type TeamRow,
  type VolunteerApplicationRow,
  type VolunteerRow,
} from '../../db/schema/index.js';
import { notDeleted } from '../../db/soft-delete.js';

/** An application with the volunteer's contact details. */
export type ApplicationView = VolunteerApplicationRow &
  Pick<VolunteerRow, 'name' | 'email' | 'phone'>;

const applicationViewColumns = {
  application: volunteerApplication,
  name: volunteer.name,
  email: volunteer.email,
  phone: volunteer.phone,
};

const toApplicationView = (row: {
  application: VolunteerApplicationRow;
  name: string;
  email: string | null;
  phone: string | null;
}): ApplicationView => ({ ...row.application, name: row.name, email: row.email, phone: row.phone });

/**
 * Data access for planning. Event-scoped methods take an event id the route has already
 * authorized within the caller's organization; volunteers are looked up per organization.
 * Writes take a `tx` so the service logs them in the same transaction. Reads skip soft-deleted
 * rows, including rows whose parent (team, shift, application) was deleted.
 */
@Injectable()
export class PlanningRepository {
  constructor(@InjectDrizzle() private readonly db: Database) {}

  // ── Teams ────────────────────────────────────────────────────────────────────────────────────

  listTeams(eventId: string, db: DbExecutor = this.db): Promise<TeamRow[]> {
    return db
      .select()
      .from(team)
      .where(and(eq(team.eventId, eventId), notDeleted(team)))
      .orderBy(asc(team.createdAt));
  }

  async findTeam(eventId: string, teamId: string, db: DbExecutor = this.db) {
    const [row] = await db
      .select()
      .from(team)
      .where(and(eq(team.id, teamId), eq(team.eventId, eventId), notDeleted(team)))
      .limit(1);
    return row;
  }

  async insertTeam(
    tx: DbExecutor,
    values: Pick<TeamRow, 'eventId' | 'name' | 'description' | 'defaultMeetingPoint'>,
  ): Promise<TeamRow> {
    const [row] = await tx.insert(team).values(values).returning();
    return row!;
  }

  async updateTeam(tx: DbExecutor, teamId: string, patch: Partial<TeamRow>): Promise<TeamRow> {
    const [row] = await tx.update(team).set(patch).where(eq(team.id, teamId)).returning();
    return row!;
  }

  async softDeleteTeam(tx: DbExecutor, teamId: string): Promise<TeamRow> {
    const [row] = await tx
      .update(team)
      .set({ deletedAt: new Date() })
      .where(eq(team.id, teamId))
      .returning();
    return row!;
  }

  // ── Shifts ───────────────────────────────────────────────────────────────────────────────────

  /** Live shifts of live teams, in time order. */
  listShifts(eventId: string, db: DbExecutor = this.db): Promise<ShiftRow[]> {
    return db
      .select({ shift })
      .from(shift)
      .innerJoin(team, eq(team.id, shift.teamId))
      .where(and(eq(shift.eventId, eventId), notDeleted(shift), notDeleted(team)))
      .orderBy(asc(shift.startsAt), asc(shift.createdAt))
      .then((rows) => rows.map((row) => row.shift));
  }

  async findShift(eventId: string, shiftId: string, db: DbExecutor = this.db) {
    const [row] = await db
      .select({ shift })
      .from(shift)
      .innerJoin(team, eq(team.id, shift.teamId))
      .where(
        and(eq(shift.id, shiftId), eq(shift.eventId, eventId), notDeleted(shift), notDeleted(team)),
      )
      .limit(1);
    return row?.shift;
  }

  async insertShift(
    tx: DbExecutor,
    values: Pick<
      ShiftRow,
      'eventId' | 'teamId' | 'meetingPoint' | 'startsAt' | 'endsAt' | 'capacity'
    >,
  ): Promise<ShiftRow> {
    const [row] = await tx.insert(shift).values(values).returning();
    return row!;
  }

  async updateShift(tx: DbExecutor, shiftId: string, patch: Partial<ShiftRow>): Promise<ShiftRow> {
    const [row] = await tx.update(shift).set(patch).where(eq(shift.id, shiftId)).returning();
    return row!;
  }

  /** Soft-deletes the shifts and returns them. */
  async softDeleteShifts(tx: DbExecutor, shiftIds: string[]): Promise<ShiftRow[]> {
    if (shiftIds.length === 0) return [];
    return tx
      .update(shift)
      .set({ deletedAt: new Date() })
      .where(and(inArray(shift.id, shiftIds), notDeleted(shift)))
      .returning();
  }

  // ── Volunteers and applications ──────────────────────────────────────────────────────────────

  async listApplications(eventId: string, db: DbExecutor = this.db): Promise<ApplicationView[]> {
    const rows = await db
      .select(applicationViewColumns)
      .from(volunteerApplication)
      .innerJoin(volunteer, eq(volunteer.id, volunteerApplication.volunteerId))
      .where(
        and(
          eq(volunteerApplication.eventId, eventId),
          notDeleted(volunteerApplication),
          notDeleted(volunteer),
        ),
      )
      .orderBy(asc(volunteerApplication.createdAt));
    return rows.map(toApplicationView);
  }

  async findApplication(
    eventId: string,
    applicationId: string,
    db: DbExecutor = this.db,
  ): Promise<ApplicationView | undefined> {
    const [row] = await db
      .select(applicationViewColumns)
      .from(volunteerApplication)
      .innerJoin(volunteer, eq(volunteer.id, volunteerApplication.volunteerId))
      .where(
        and(
          eq(volunteerApplication.id, applicationId),
          eq(volunteerApplication.eventId, eventId),
          notDeleted(volunteerApplication),
          notDeleted(volunteer),
        ),
      )
      .limit(1);
    return row && toApplicationView(row);
  }

  async findApplicationOfVolunteer(tx: DbExecutor, eventId: string, volunteerId: string) {
    const [row] = await tx
      .select()
      .from(volunteerApplication)
      .where(
        and(
          eq(volunteerApplication.eventId, eventId),
          eq(volunteerApplication.volunteerId, volunteerId),
          notDeleted(volunteerApplication),
        ),
      )
      .limit(1);
    return row;
  }

  /** The organization's volunteer with this email (ignoring case). */
  async findVolunteerByEmail(tx: DbExecutor, organizationId: string, email: string) {
    const [row] = await tx
      .select()
      .from(volunteer)
      .where(
        and(
          eq(volunteer.organizationId, organizationId),
          sql`lower(${volunteer.email}) = lower(${email})`,
          notDeleted(volunteer),
        ),
      )
      .limit(1);
    return row;
  }

  async findVolunteer(tx: DbExecutor, organizationId: string, volunteerId: string) {
    const [row] = await tx
      .select()
      .from(volunteer)
      .where(
        and(
          eq(volunteer.id, volunteerId),
          eq(volunteer.organizationId, organizationId),
          notDeleted(volunteer),
        ),
      )
      .limit(1);
    return row;
  }

  async insertVolunteer(
    tx: DbExecutor,
    values: Pick<VolunteerRow, 'organizationId' | 'name' | 'email' | 'phone'>,
  ): Promise<VolunteerRow> {
    const [row] = await tx.insert(volunteer).values(values).returning();
    return row!;
  }

  async updateVolunteer(
    tx: DbExecutor,
    volunteerId: string,
    patch: Partial<Pick<VolunteerRow, 'name' | 'email' | 'phone'>>,
  ): Promise<VolunteerRow> {
    const [row] = await tx
      .update(volunteer)
      .set(patch)
      .where(eq(volunteer.id, volunteerId))
      .returning();
    return row!;
  }

  async insertApplication(
    tx: DbExecutor,
    values: Pick<
      VolunteerApplicationRow,
      | 'eventId'
      | 'volunteerId'
      | 'source'
      | 'availableShiftIds'
      | 'wholeEvent'
      | 'preferredTeamId'
      | 'notes'
      | 'consentedAt'
    >,
  ): Promise<VolunteerApplicationRow> {
    const [row] = await tx.insert(volunteerApplication).values(values).returning();
    return row!;
  }

  async updateApplication(
    tx: DbExecutor,
    applicationId: string,
    patch: Partial<VolunteerApplicationRow>,
  ): Promise<VolunteerApplicationRow> {
    const [row] = await tx
      .update(volunteerApplication)
      // Always bump updated_at: a re-submit with the same answers still counts as a new submit.
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(volunteerApplication.id, applicationId))
      .returning();
    return row!;
  }

  /**
   * Stores what a volunteer was last told. Bookkeeping, not an edit of their sign-up, so it
   * leaves `updated_at` alone.
   */
  async setNotifiedSchedule(
    tx: DbExecutor,
    applicationId: string,
    schedule: ScheduleEntry[],
  ): Promise<VolunteerApplicationRow> {
    const [row] = await tx
      .update(volunteerApplication)
      .set({ notifiedSchedule: schedule })
      .where(eq(volunteerApplication.id, applicationId))
      .returning();
    return row!;
  }

  /** Clears a deleted team as anyone's preference. */
  async clearPreferredTeam(tx: DbExecutor, teamId: string): Promise<VolunteerApplicationRow[]> {
    return tx
      .update(volunteerApplication)
      .set({ preferredTeamId: null })
      .where(
        and(eq(volunteerApplication.preferredTeamId, teamId), notDeleted(volunteerApplication)),
      )
      .returning();
  }

  // ── Assignments ──────────────────────────────────────────────────────────────────────────────

  /** Live assignments of the event, on live shifts of live teams and live applications. */
  async listAssignments(eventId: string, db: DbExecutor = this.db): Promise<AssignmentRow[]> {
    const rows = await db
      .select({ assignment })
      .from(assignment)
      .innerJoin(shift, eq(shift.id, assignment.shiftId))
      .innerJoin(team, eq(team.id, shift.teamId))
      .innerJoin(volunteerApplication, eq(volunteerApplication.id, assignment.applicationId))
      .where(
        and(
          eq(shift.eventId, eventId),
          notDeleted(assignment),
          notDeleted(shift),
          notDeleted(team),
          notDeleted(volunteerApplication),
        ),
      )
      .orderBy(asc(assignment.createdAt));
    return rows.map((row) => row.assignment);
  }

  async findAssignment(eventId: string, assignmentId: string, db: DbExecutor = this.db) {
    const rows = await this.listAssignments(eventId, db);
    return rows.find((row) => row.id === assignmentId);
  }

  async insertAssignment(
    tx: DbExecutor,
    values: Pick<AssignmentRow, 'applicationId' | 'shiftId' | 'assignedByUserId'>,
  ): Promise<AssignmentRow> {
    const [row] = await tx.insert(assignment).values(values).returning();
    return row!;
  }

  async updateAssignment(
    tx: DbExecutor,
    assignmentId: string,
    patch: Partial<Pick<AssignmentRow, 'shiftId' | 'status' | 'assignedByUserId'>>,
  ): Promise<AssignmentRow> {
    const [row] = await tx
      .update(assignment)
      .set(patch)
      .where(eq(assignment.id, assignmentId))
      .returning();
    return row!;
  }

  async setAssignmentsStatus(
    tx: DbExecutor,
    assignmentIds: string[],
    status: AssignmentStatus,
  ): Promise<AssignmentRow[]> {
    if (assignmentIds.length === 0) return [];
    return tx
      .update(assignment)
      .set({ status })
      .where(and(inArray(assignment.id, assignmentIds), notDeleted(assignment)))
      .returning();
  }

  async softDeleteAssignments(tx: DbExecutor, assignmentIds: string[]): Promise<AssignmentRow[]> {
    if (assignmentIds.length === 0) return [];
    return tx
      .update(assignment)
      .set({ deletedAt: new Date() })
      .where(and(inArray(assignment.id, assignmentIds), notDeleted(assignment)))
      .returning();
  }

  /** Locks the event row, so concurrent placements on its shifts are checked one at a time. */
  async lockEvent(tx: DbExecutor, eventId: string): Promise<void> {
    await tx.execute(sql`select 1 from ${event} where ${event.id} = ${eventId} for update`);
  }

  // ── Event settings and the public page ───────────────────────────────────────────────────────

  async updateEvent(
    tx: DbExecutor,
    eventId: string,
    patch: Partial<
      Pick<
        EventRow,
        | 'registrationOpen'
        | 'registrationDeadline'
        | 'volunteerCommitment'
        | 'shiftsPerVolunteer'
        | 'publicSlug'
        | 'schedulePublishedAt'
      >
    >,
  ): Promise<EventRow> {
    const [row] = await tx.update(event).set(patch).where(eq(event.id, eventId)).returning();
    return row!;
  }

  /**
   * Marks the schedule as sent, only if it wasn't yet. Returns the event, or undefined when
   * another request got there first.
   */
  async claimSchedulePublish(tx: DbExecutor, eventId: string): Promise<EventRow | undefined> {
    const [row] = await tx
      .update(event)
      .set({ schedulePublishedAt: new Date() })
      .where(and(eq(event.id, eventId), isNull(event.schedulePublishedAt)))
      .returning();
    return row;
  }

  /** The live event behind a public link, with its organization's name. */
  async findBySlug(
    slug: string,
  ): Promise<{ event: EventRow; organizationName: string } | undefined> {
    const [row] = await this.db
      .select({ event, organizationName: organization.name })
      .from(event)
      .innerJoin(organization, eq(organization.id, event.organizationId))
      .where(and(eq(event.publicSlug, slug), notDeleted(event)))
      .limit(1);
    return row;
  }

  async findUserEmail(userId: string): Promise<string | undefined> {
    const [row] = await this.db
      .select({ email: user.email })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);
    return row?.email;
  }

  async findOrganizationName(organizationId: string): Promise<string> {
    const [row] = await this.db
      .select({ name: organization.name })
      .from(organization)
      .where(eq(organization.id, organizationId))
      .limit(1);
    return row?.name ?? '';
  }
}
