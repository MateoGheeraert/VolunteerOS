import { Injectable, Logger } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, eq } from 'drizzle-orm';
import type { Database } from '../../db/database.js';
import { event, type AiRunRow, type EventRow } from '../../db/schema/index.js';
import { notDeleted } from '../../db/soft-delete.js';
import { allocate, type SolverRule } from '../../features/planning/allocation.js';
import { PlanningRuleService } from '../../features/planning/planning-rule.service.js';
import { PlanningRepository } from '../../features/planning/planning.repository.js';
import { LiveUpdatesService } from '../../jobs/live-updates.service.js';
import { AiClient } from '../ai-client.service.js';
import { AllocationInputs } from './allocation-inputs.service.js';
import {
  planningRulePayloadSchema,
  type AllocationPayload,
} from '../planning/planning-payloads.js';
import { buildNotesContext } from '../rule-drafts/rule-drafts.context.js';
import {
  planNoteRules,
  ruleKey,
  toSolverRule,
  type NotesPlan,
} from '../rule-drafts/rule-drafts.plan.js';
import { NOTES_PROMPT_VERSION, NOTES_SYSTEM } from '../rule-drafts/rule-drafts.prompt.js';
import { notesOutputSchema } from '../rule-drafts/rule-drafts.schema.js';
import { AiSuggestionsRepository } from '../suggestions/ai-suggestions.repository.js';
import { EventGoneError } from '../task-suggestions/task-suggestions.runner.js';

const OUTPUT_LANGUAGE = 'nl-BE';

/** The model that read the notes; when nobody wrote one, no model is called. */
const NO_MODEL = 'none';

/**
 * Carries out "Laat Mila verdelen" (docs/info.md §7.7.1 C):
 * 1. Mila reads the volunteers' notes into rule cards (one model call, only when there are notes).
 * 2. The solver fills the open places, respecting the confirmed rules and the notes' rules that
 *    aren't rejected. It never touches existing assignments.
 * 3. The proposal is saved as one `allocation` card with the solver's reasons for every gap, and
 *    replaces the previous open proposal.
 */
@Injectable()
export class AllocationRunner {
  private readonly logger = new Logger(AllocationRunner.name);

  constructor(
    @InjectDrizzle() private readonly db: Database,
    private readonly ai: AiClient,
    private readonly planning: PlanningRepository,
    private readonly rules: PlanningRuleService,
    private readonly suggestions: AiSuggestionsRepository,
    private readonly live: LiveUpdatesService,
    private readonly inputs: AllocationInputs,
  ) {}

  async run(run: AiRunRow): Promise<{ model: string; promptVersion: string }> {
    const current = await this.findEvent(run.organizationId, run.eventId);
    if (!current) throw new EventGoneError();

    const [teams, applications, earlierCards] = await Promise.all([
      this.planning.listTeams(current.id),
      this.planning.listApplications(current.id),
      this.suggestions.listForEvent(current.id, ['planning_rule'], 500),
    ]);
    const volunteerIds = applications.map((a) => a.volunteerId);
    const confirmed = await this.rules.rulesFor(
      this.db,
      run.organizationId,
      current.id,
      volunteerIds,
    );

    // 1. The notes.
    const notes = applications
      .filter((a) => a.notes?.trim())
      .map((a) => ({ applicationId: a.id, volunteerId: a.volunteerId, text: a.notes! }));
    let notesPlan: NotesPlan = { cards: [], solverRules: [], dropped: [] };
    let model: string = NO_MODEL;
    if (notes.length > 0) {
      const context = buildNotesContext({
        language: OUTPUT_LANGUAGE,
        event: { name: current.name },
        teams,
        volunteers: applications.map((a) => ({ volunteerId: a.volunteerId, name: a.name })),
        notes,
      });
      const result = await this.ai.generate({
        run,
        feature: 'allocation',
        promptVersion: NOTES_PROMPT_VERSION,
        schema: notesOutputSchema,
        system: NOTES_SYSTEM,
        prompt: context.prompt,
      });
      model = result.model;
      notesPlan = planNoteRules(result.output, context, {
        existingRuleKeys: new Set(confirmed.map(ruleKey)),
        decidedCards: new Map(earlierCards.map((row) => [row.dedupKey, row.status])),
      });
      if (notesPlan.dropped.length > 0) {
        this.logger.log(`Run ${run.id} dropped ${JSON.stringify(notesPlan.dropped)}`);
      }
    }
    // Note rules still waiting from earlier runs apply too, until the organizer decides.
    const waiting: SolverRule[] = [];
    for (const row of earlierCards) {
      if (row.status !== 'pending' || notesPlan.cards.some((c) => c.dedupKey === row.dedupKey)) {
        continue;
      }
      const parsed = planningRulePayloadSchema.safeParse(row.payload);
      if (!parsed.success) continue;
      const { person, other } = parsed.data;
      if (!person.volunteerId || (other && !other.volunteerId)) continue;
      waiting.push(toSolverRule(parsed.data, person.volunteerId));
    }

    // 2. The solver, on the board as it is now, with the notes' rules on top.
    const fresh = (await this.findEvent(run.organizationId, current.id)) ?? current;
    const input = await this.inputs.load(run.organizationId, fresh);
    const solverRules: SolverRule[] = [...input.rules, ...notesPlan.solverRules, ...waiting];
    const { shifts: solverShifts, assignments } = input;
    const openBefore = solverShifts.reduce(
      (sum, s) =>
        sum + Math.max(0, s.capacity - assignments.filter((a) => a.shiftId === s.id).length),
      0,
    );
    const result = allocate({ ...input, rules: solverRules });

    // 3. Save the proposal and the note cards.
    const payload: AllocationPayload = {
      placements: result.placements,
      gaps: result.gaps,
      unplaced: result.unplaced,
      proposed: result.placements.length,
      accepted: 0,
      rulesApplied: solverRules.length,
      rulesFromNotes: notesPlan.solverRules.length + waiting.length,
    };
    await this.db.transaction(async (tx) => {
      const open = (await this.suggestions.listPending(fresh.id)).filter(
        (row) => row.kind === 'allocation',
      );
      await this.suggestions.dismissStale(
        tx,
        fresh.id,
        open.map((row) => row.dedupKey),
      );
      await this.suggestions.upsert(tx, [
        ...notesPlan.cards.map((card) => ({
          ...card,
          organizationId: run.organizationId,
          eventId: fresh.id,
          runId: run.id,
        })),
        {
          kind: 'allocation',
          dedupKey: `allocation:${run.id}`,
          title: `Voorstel: ${payload.proposed} ${payload.proposed === 1 ? 'plaats' : 'plaatsen'}`,
          explanation: explain(payload, openBefore),
          payload,
          citations: [],
          organizationId: run.organizationId,
          eventId: fresh.id,
          runId: run.id,
        },
      ]);
      await this.live.publish(tx, { type: 'ai_suggestions', eventId: fresh.id });
    });

    return { model, promptVersion: NOTES_PROMPT_VERSION };
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
}

/** Mila's summary in her voice; the board lists each gap with its reason. */
function explain(payload: AllocationPayload, openBefore: number): string {
  if (openBefore === 0) return 'Alle plaatsen zijn al ingevuld: ik heb niets meer te verdelen.';
  const open = payload.gaps.reduce((sum, gap) => sum + gap.missing, 0);
  const parts = [
    payload.proposed === 0
      ? `Ik vond niemand meer voor de ${openBefore} open plaatsen.`
      : `Ik stel ${payload.proposed} van de ${openBefore} open plaatsen voor.`,
  ];
  if (payload.proposed > 0 && open > 0) {
    parts.push(`${open} ${open === 1 ? 'plaats blijft' : 'plaatsen blijven'} open.`);
  }
  if (payload.rulesFromNotes > 0) {
    parts.push(
      `Ik hield rekening met ${payload.rulesFromNotes} ${payload.rulesFromNotes === 1 ? 'ding' : 'dingen'} uit de notities.`,
    );
  }
  return parts.join(' ');
}
