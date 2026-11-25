import { Injectable, Logger } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, eq } from 'drizzle-orm';
import type { Database } from '../../db/database.js';
import { event, type AiRunRow, type EventRow } from '../../db/schema/index.js';
import { notDeleted } from '../../db/soft-delete.js';
import { shiftWindow } from '../../features/planning/planning-rules.js';
import { PlanningRepository } from '../../features/planning/planning.repository.js';
import { todayInBrussels } from '../../features/profile/profile-rules.js';
import { LiveUpdatesService } from '../../jobs/live-updates.service.js';
import { AiClient } from '../ai-client.service.js';
import { AiSuggestionsRepository } from '../suggestions/ai-suggestions.repository.js';
import { EventGoneError } from '../task-suggestions/task-suggestions.runner.js';
import { buildShiftSuggestionContext } from './shift-suggestions.context.js';
import { planShiftSuggestions } from './shift-suggestions.plan.js';
import {
  SHIFT_SUGGESTIONS_PROMPT_VERSION,
  shiftSuggestionsSystem,
} from './shift-suggestions.prompt.js';
import { shiftSuggestionOutputSchema } from './shift-suggestions.schema.js';

const OUTPUT_LANGUAGE = 'nl-BE';

/**
 * Carries out one "Stel teams en shiften voor" run (docs/info.md §7.7.1 A): the event, its
 * previous edition's teams and shifts and the staffing catalogue go to the model; the planner's
 * rules turn the answer into team and shift cards, saved in one transaction.
 */
@Injectable()
export class ShiftSuggestionsRunner {
  private readonly logger = new Logger(ShiftSuggestionsRunner.name);

  constructor(
    @InjectDrizzle() private readonly db: Database,
    private readonly ai: AiClient,
    private readonly planning: PlanningRepository,
    private readonly suggestions: AiSuggestionsRepository,
    private readonly live: LiveUpdatesService,
  ) {}

  async run(run: AiRunRow): Promise<{ model: string; promptVersion: string }> {
    const current = await this.findEvent(run.organizationId, run.eventId);
    if (!current) throw new EventGoneError();
    const previous = current.previousEditionId
      ? await this.findEvent(run.organizationId, current.previousEditionId)
      : undefined;

    const [teams, previousTeams, applications, earlier] = await Promise.all([
      this.teamsWithShifts(current.id),
      previous ? this.teamsWithShifts(previous.id) : Promise.resolve([]),
      this.planning.listApplications(current.id),
      this.suggestions.listForEvent(current.id, ['team_suggestion', 'shift_change']),
    ]);
    const window = shiftWindow(current);
    const { prompt, refs, teamRefs, shiftRefs } = buildShiftSuggestionContext({
      language: OUTPUT_LANGUAGE,
      today: todayInBrussels(),
      event: {
        id: current.id,
        name: current.name,
        eventType: current.eventType,
        startsAt: current.startsAt,
        endsAt: current.endsAt,
        windowStartsAt: window.startsAt,
        windowEndsAt: window.endsAt,
        expectedAttendance: current.expectedAttendance,
        volunteerCount: applications.length,
        shiftsPerVolunteer:
          current.volunteerCommitment === 'whole_event' ? null : current.shiftsPerVolunteer,
      },
      previousEdition: previous
        ? {
            id: previous.id,
            name: previous.name,
            startsAt: previous.startsAt,
            expectedAttendance: previous.expectedAttendance,
            actualAttendance: previous.actualAttendance,
            retrospective: previous.retrospective,
            teams: previousTeams,
          }
        : null,
      currentTeams: teams,
      // Open proposals are replaced by this run, so only decided ones are "suggested before".
      earlierSuggestions: earlier
        .filter((row) => row.status === 'accepted' || row.status === 'rejected')
        .map((row) => ({ title: row.title, status: row.status })),
      instruction: run.instruction,
    });

    const result = await this.ai.generate({
      run,
      feature: 'shift_suggestions',
      promptVersion: SHIFT_SUGGESTIONS_PROMPT_VERSION,
      schema: shiftSuggestionOutputSchema,
      system: shiftSuggestionsSystem(Boolean(run.instruction)),
      prompt,
    });

    // Plan against the board as it is now: the organizer may have changed it during the call.
    const fresh = (await this.findEvent(run.organizationId, current.id)) ?? current;
    const freshTeams = await this.planning.listTeams(fresh.id);
    const plan = planShiftSuggestions(result.output, refs, {
      window: shiftWindow(fresh),
      existingTeamNames: freshTeams.map((t) => t.name),
      teamRefs,
      shiftRefs,
    });
    if (plan.dropped.length > 0) {
      this.logger.log(`Run ${run.id} dropped ${JSON.stringify(plan.dropped)}`);
    }

    await this.db.transaction(async (tx) => {
      const pending = (await this.suggestions.listPending(fresh.id)).filter(
        (row) => row.kind === 'team_suggestion' || row.kind === 'shift_change',
      );
      // A new request replaces the proposals still open (accepted and rejected ones stay), so
      // the board shows one plan, and a team asked for again gets its new shifts.
      await this.suggestions.dismissStale(
        tx,
        fresh.id,
        pending.map((row) => row.dedupKey),
      );
      await this.suggestions.upsert(
        tx,
        plan.cards.map((card) => ({
          ...card,
          organizationId: run.organizationId,
          eventId: fresh.id,
          runId: run.id,
        })),
        // Asked for in so many words ("twee shiften afwas"): back, even if rejected before.
        { reopenRejected: Boolean(run.instruction) },
      );
      await this.live.publish(tx, { type: 'ai_suggestions', eventId: fresh.id });
    });

    return { model: result.model, promptVersion: SHIFT_SUGGESTIONS_PROMPT_VERSION };
  }

  private async findEvent(organizationId: string, eventId: string): Promise<EventRow | undefined> {
    const [row] = await this.db
      .select()
      .from(event)
      .where(
        and(eq(event.id, eventId), eq(event.organizationId, organizationId), notDeleted(event)),
      )
      .limit(1);
    return row;
  }

  /** The event's teams, each with its shifts and how many people are on them. */
  private async teamsWithShifts(eventId: string) {
    const [teams, shifts, assignments] = await Promise.all([
      this.planning.listTeams(eventId),
      this.planning.listShifts(eventId),
      this.planning.listAssignments(eventId),
    ]);
    return teams.map((team) => ({
      id: team.id,
      name: team.name,
      description: team.description,
      defaultMeetingPoint: team.defaultMeetingPoint,
      shifts: shifts
        .filter((s) => s.teamId === team.id)
        .map((s) => ({
          id: s.id,
          startsAt: s.startsAt,
          endsAt: s.endsAt,
          capacity: s.capacity,
          assigned: assignments.filter((a) => a.shiftId === s.id).length,
        })),
    }));
  }
}
