import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, eq } from 'drizzle-orm';
import { recordActivity, withSource } from '../../activity/activity-log.js';
import type { EventAccess } from '../../authz/event-access.service.js';
import type { OrgContext } from '../../authz/org-context.js';
import type { Database, Transaction } from '../../db/database.js';
import {
  aiSuggestion,
  type AiFeature,
  type AiSuggestionKind,
  type AiSuggestionRow,
} from '../../db/schema/index.js';
import { PlanningRuleService } from '../../features/planning/planning-rule.service.js';
import { PlanningService } from '../../features/planning/planning.service.js';
import { VolunteersService } from '../../features/planning/volunteers.service.js';
import { LiveUpdatesService } from '../../jobs/live-updates.service.js';
import type { AiRunDto } from '../ai.schemas.js';
import { AiRunsService } from '../runs/ai-runs.service.js';
import { AiSuggestionsRepository } from '../suggestions/ai-suggestions.repository.js';
import type {
  AcceptPlacementsResultDto,
  AcceptRuleSuggestionInput,
  AcceptShiftChangeInput,
  AcceptTeamSuggestionsInput,
  PlacementsInput,
} from './planning-ai.schemas.js';
import {
  allocationPayloadSchema,
  shiftChangePayloadSchema,
  type AllocationPayload,
} from './planning-payloads.js';
import { checkPlacements } from '../../features/planning/allocation.js';
import { AllocationInputs } from '../allocation/allocation-inputs.service.js';

/** Suggestion fields the activity log keeps the values of: none are personal. */
const SUGGESTION_LOGGED_VALUES = ['kind', 'status'] as const;

/**
 * What organizers do with Mila's planning cards (docs/info.md §7.7.1). Like task suggestions:
 * the agent never changes the planning itself. Accepting runs the planning services as the
 * organizer, in the transaction that marks the card, with the card as the change's source.
 * Rejecting goes through the shared reject route.
 *
 * Routes have already authorized the event for 'manage'.
 */
@Injectable()
export class PlanningSuggestionsService {
  constructor(
    @InjectDrizzle() private readonly db: Database,
    private readonly suggestions: AiSuggestionsRepository,
    private readonly runs: AiRunsService,
    private readonly planning: PlanningService,
    private readonly volunteers: VolunteersService,
    private readonly rules: PlanningRuleService,
    private readonly live: LiveUpdatesService,
    private readonly inputs: AllocationInputs,
  ) {}

  /** "Stel teams en shiften voor" or "Laat Mila verdelen": queues the run. */
  async request(
    org: OrgContext,
    access: EventAccess,
    feature: Extract<AiFeature, 'shift_suggestions' | 'allocation'>,
    /** What the organizer asks for ("twee shiften afwas"); without it Mila decides herself. */
    instruction?: string,
  ): Promise<AiRunDto> {
    const run = await this.runs.enqueue({
      organizationId: org.organizationId,
      eventId: access.event.id,
      feature,
      trigger: 'on_demand',
      requestedByUserId: org.userId,
      instruction: instruction || null,
    });
    if (!run) throw new ConflictException('AI is not available');
    return {
      id: run.id,
      feature: run.feature,
      trigger: run.trigger,
      status: run.status,
      createdAt: run.createdAt.toISOString(),
      finishedAt: run.finishedAt?.toISOString() ?? null,
    };
  }

  /** Creates each team (as edited) with the shifts kept, and marks the cards accepted. */
  async acceptTeams(
    org: OrgContext,
    access: EventAccess,
    input: AcceptTeamSuggestionsInput,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const item of input.items) {
        const row = await this.decide(tx, org, access, item.suggestionId, 'team_suggestion');
        const scope = withSource(org, { type: 'ai_suggestion', id: row.id });
        const team = await this.planning.createTeamInTransaction(
          tx,
          scope,
          access.event,
          item.team,
        );
        for (const shift of item.shifts) {
          const startsAt = new Date(shift.startsAt);
          const endsAt = new Date(shift.endsAt);
          if (endsAt <= startsAt) throw new BadRequestException('endsAt must be after startsAt');
          await this.planning.createShiftInTransaction(tx, scope, access.event, {
            teamId: team.id,
            meetingPoint: null,
            startsAt,
            endsAt,
            capacity: shift.capacity,
          });
        }
      }
      await this.live.publish(tx, { type: 'ai_suggestions', eventId: access.event.id });
    });
  }

  /** Adds the extra shift, or sets the new capacity (as edited), and marks the card accepted. */
  async acceptShiftChange(
    org: OrgContext,
    access: EventAccess,
    suggestionId: string,
    input: AcceptShiftChangeInput,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const row = await this.decide(tx, org, access, suggestionId, 'shift_change');
      const payload = shiftChangePayloadSchema.parse(row.payload);
      const scope = withSource(org, { type: 'ai_suggestion', id: row.id });
      const capacity = input.capacity ?? payload.capacity;
      if (payload.type === 'capacity') {
        await this.planning.setCapacityInTransaction(
          tx,
          scope,
          access.event,
          payload.shiftId!,
          capacity,
        );
      } else {
        await this.planning.createShiftInTransaction(tx, scope, access.event, {
          teamId: payload.teamId,
          meetingPoint: null,
          startsAt: new Date(payload.startsAt),
          endsAt: new Date(payload.endsAt),
          capacity,
        });
      }
      await this.live.publish(tx, { type: 'ai_suggestions', eventId: access.event.id });
    });
  }

  /** Saves a rule read from a note, as the organizer set it, and marks the card accepted. */
  async acceptRule(
    org: OrgContext,
    access: EventAccess,
    suggestionId: string,
    input: AcceptRuleSuggestionInput,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const row = await this.decide(tx, org, access, suggestionId, 'planning_rule');
      await this.rules.createInTransaction(
        tx,
        withSource(org, { type: 'ai_suggestion', id: row.id }),
        access.event,
        [input.rule],
        'volunteer_note',
      );
      await this.live.publish(tx, { type: 'ai_suggestions', eventId: access.event.id });
    });
  }

  /**
   * Takes over some of the proposal's placements as proposed assignments: all, a shift's or a
   * person's. Each is checked against the board as it is now and skipped when no longer
   * possible. The rest of the proposal stays; once nothing is left, the card is accepted.
   */
  async acceptPlacements(
    org: OrgContext,
    access: EventAccess,
    suggestionId: string,
    input: PlacementsInput,
  ): Promise<AcceptPlacementsResultDto> {
    return this.db.transaction(async (tx) => {
      const { row, payload } = await this.openAllocation(tx, access, suggestionId);
      const chosen = pick(payload, input);
      // The board may have changed since the proposal: check the solver's hard rules again
      // (shift limits, rules added since, people placed by hand) and skip what no longer fits.
      const board = await this.inputs.load(org.organizationId, access.event);
      const { allowed } = checkPlacements(board, chosen);
      const scope = withSource(org, { type: 'ai_suggestion', id: row.id });
      const { placed } = await this.volunteers.proposeInTransaction(
        tx,
        scope,
        access.event,
        allowed,
      );
      await this.settle(tx, org, access, row, {
        ...payload,
        placements: without(payload, chosen),
        accepted: payload.accepted + placed.length,
      });
      return { placed: placed.length, skipped: chosen.length - placed.length };
    });
  }

  /** Drops placements from the proposal without taking them over. */
  async discardPlacements(
    org: OrgContext,
    access: EventAccess,
    suggestionId: string,
    input: PlacementsInput,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const { row, payload } = await this.openAllocation(tx, access, suggestionId);
      const chosen = pick(payload, input);
      await this.settle(tx, org, access, row, { ...payload, placements: without(payload, chosen) });
    });
  }

  private async openAllocation(tx: Transaction, access: EventAccess, suggestionId: string) {
    // Locked, so two organizers taking over chips at once don't both act on the same ones.
    const [row] = await tx
      .select()
      .from(aiSuggestion)
      .where(
        and(
          eq(aiSuggestion.id, suggestionId),
          eq(aiSuggestion.eventId, access.event.id),
          eq(aiSuggestion.kind, 'allocation'),
        ),
      )
      .for('update')
      .limit(1);
    if (!row) throw new NotFoundException('Suggestion not found');
    if (row.status !== 'pending') throw new ConflictException('The suggestion was already handled');
    return { row, payload: allocationPayloadSchema.parse(row.payload) };
  }

  /** Saves what is left of the proposal; with nothing left, decides the card. */
  private async settle(
    tx: Transaction,
    org: OrgContext,
    access: EventAccess,
    row: AiSuggestionRow,
    payload: AllocationPayload,
  ): Promise<void> {
    await tx
      .update(aiSuggestion)
      .set({ payload: allocationPayloadSchema.parse(payload) })
      .where(eq(aiSuggestion.id, row.id));
    if (payload.placements.length === 0) {
      await this.decide(
        tx,
        org,
        access,
        row.id,
        'allocation',
        payload.accepted > 0 ? 'accepted' : 'rejected',
      );
    }
    await this.live.publish(tx, { type: 'ai_suggestions', eventId: access.event.id });
  }

  /** Marks the pending card decided and logs it; 404 or 409 when it can't be. */
  private async decide(
    tx: Transaction,
    org: OrgContext,
    access: EventAccess,
    suggestionId: string,
    kind: AiSuggestionKind,
    status: 'accepted' | 'rejected' = 'accepted',
  ): Promise<AiSuggestionRow> {
    const eventId = access.event.id;
    const current = await this.suggestions.find(eventId, suggestionId);
    if (!current || current.kind !== kind) throw new NotFoundException('Suggestion not found');
    const row = await this.suggestions.decide(tx, eventId, suggestionId, kind, status, org.userId);
    if (!row) throw new ConflictException('The suggestion was already handled');
    await recordActivity(tx, org, {
      action: status,
      entityType: 'ai_suggestion',
      entity: row,
      before: current,
      eventId,
      values: SUGGESTION_LOGGED_VALUES,
    });
    return row;
  }
}

const placementKey = (p: { applicationId: string; shiftId: string }) =>
  `${p.applicationId}:${p.shiftId}`;

/** The requested placements that are still in the proposal. */
function pick(payload: AllocationPayload, input: PlacementsInput) {
  const open = new Set(payload.placements.map(placementKey));
  const chosen = input.placements.filter((p) => open.has(placementKey(p)));
  if (chosen.length === 0) throw new ConflictException('These placements are no longer proposed');
  return chosen;
}

function without(payload: AllocationPayload, chosen: { applicationId: string; shiftId: string }[]) {
  const gone = new Set(chosen.map(placementKey));
  return payload.placements.filter((p) => !gone.has(placementKey(p)));
}
