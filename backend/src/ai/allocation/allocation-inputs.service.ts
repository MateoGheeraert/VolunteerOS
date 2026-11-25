import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import type { Database } from '../../db/database.js';
import type { EventRow } from '../../db/schema/index.js';
import {
  eventClock,
  type SolverInput,
  type SolverRule,
  type SolverShift,
  type SolverVolunteer,
} from '../../features/planning/allocation.js';
import { brusselsMinutes } from '../../features/planning/brussels-time.js';
import { PlanningRuleService } from '../../features/planning/planning-rule.service.js';
import { PlanningRepository } from '../../features/planning/planning.repository.js';
import { toSolverRule } from '../rule-drafts/rule-drafts.plan.js';

/**
 * The board as the solver sees it, read from the database: the shifts with their teams and
 * clock times, the volunteers with their availability and last edition's teams, the current
 * assignments, the shift limit and the confirmed rules. "Laat Mila verdelen" plans on it;
 * taking over her proposal checks the placements against it again.
 */
@Injectable()
export class AllocationInputs {
  constructor(
    @InjectDrizzle() private readonly db: Database,
    private readonly planning: PlanningRepository,
    private readonly rules: PlanningRuleService,
  ) {}

  async load(organizationId: string, current: EventRow): Promise<SolverInput> {
    const [teams, shifts, applications, assignments, previousTeams] = await Promise.all([
      this.planning.listTeams(current.id),
      this.planning.listShifts(current.id),
      this.planning.listApplications(current.id),
      this.planning.listAssignments(current.id),
      this.previousTeamsByVolunteer(current),
    ]);
    const confirmed = await this.rules.rulesFor(
      this.db,
      organizationId,
      current.id,
      applications.map((a) => a.volunteerId),
    );
    const teamName = new Map(teams.map((t) => [t.id, t.name]));
    const liveShiftIds = new Set(shifts.map((s) => s.id));
    const solverShifts: SolverShift[] = shifts.map((s) => {
      const startClock = eventClock(brusselsMinutes(s.startsAt));
      return {
        id: s.id,
        teamId: s.teamId,
        teamName: teamName.get(s.teamId) ?? '',
        startsAt: s.startsAt,
        endsAt: s.endsAt,
        capacity: s.capacity,
        startClock,
        endClock: startClock + Math.round((s.endsAt.getTime() - s.startsAt.getTime()) / 60_000),
      };
    });
    const volunteers: SolverVolunteer[] = applications.map((a) => ({
      applicationId: a.id,
      volunteerId: a.volunteerId,
      name: a.name,
      wholeEvent: a.wholeEvent,
      availableShiftIds: a.availableShiftIds.filter((id) => liveShiftIds.has(id)),
      preferredTeamId: a.preferredTeamId,
      previousTeams: previousTeams.get(a.volunteerId) ?? [],
    }));
    const rules: SolverRule[] = confirmed.map((rule) =>
      toSolverRule({ ...rule, other: { volunteerId: rule.otherVolunteerId } }, rule.volunteerId),
    );
    return {
      shifts: solverShifts,
      volunteers,
      assignments,
      maxShiftsPerVolunteer:
        current.volunteerCommitment === 'whole_event' ? null : current.shiftsPerVolunteer,
      rules,
    };
  }

  /** Volunteer → the teams they worked in at the previous edition. */
  private async previousTeamsByVolunteer(current: EventRow): Promise<Map<string, string[]>> {
    const result = new Map<string, string[]>();
    if (!current.previousEditionId) return result;
    const previousId = current.previousEditionId;
    const [teams, shifts, applications, assignments] = await Promise.all([
      this.planning.listTeams(previousId),
      this.planning.listShifts(previousId),
      this.planning.listApplications(previousId),
      this.planning.listAssignments(previousId),
    ]);
    const teamOfShift = new Map(
      shifts.map((s) => [s.id, teams.find((t) => t.id === s.teamId)?.name ?? '']),
    );
    const volunteerOf = new Map(applications.map((a) => [a.id, a.volunteerId]));
    for (const a of assignments) {
      const volunteerId = volunteerOf.get(a.applicationId);
      const name = teamOfShift.get(a.shiftId);
      if (!volunteerId || !name) continue;
      result.set(volunteerId, [...(result.get(volunteerId) ?? []), name]);
    }
    return result;
  }
}
