import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, eq } from 'drizzle-orm';
import { withSource } from '../../activity/activity-log.js';
import type { EventAccess } from '../../authz/event-access.service.js';
import type { OrgContext } from '../../authz/org-context.js';
import type { Database } from '../../db/database.js';
import { aiRun } from '../../db/schema/index.js';
import { PlanningRuleService } from '../../features/planning/planning-rule.service.js';
import { PlanningRepository } from '../../features/planning/planning.repository.js';
import { AiClient, AiUnavailableError } from '../ai-client.service.js';
import type {
  CreateRulesFromDraftInput,
  RuleDraftResultDto,
} from '../planning/planning-ai.schemas.js';
import { AiRunsService } from '../runs/ai-runs.service.js';
import { buildRuleTextContext } from './rule-drafts.context.js';
import { planRuleText } from './rule-drafts.plan.js';
import { RULE_TEXT_PROMPT_VERSION, RULE_TEXT_SYSTEM } from './rule-drafts.prompt.js';
import { ruleTextOutputSchema } from './rule-drafts.schema.js';

const OUTPUT_LANGUAGE = 'nl-BE';

/**
 * "Vertel Mila iets over de planning": Mila turns the organizer's words into rule chips while
 * they wait; nothing is saved until they confirm the chips (and pick the person where a name was
 * ambiguous). The saved rules carry the drafting run as their source in the activity log.
 *
 * Routes have already authorized the event for 'manage'.
 */
@Injectable()
export class RuleDraftsService {
  constructor(
    @InjectDrizzle() private readonly db: Database,
    private readonly ai: AiClient,
    private readonly runs: AiRunsService,
    private readonly planning: PlanningRepository,
    private readonly rules: PlanningRuleService,
  ) {}

  async draft(org: OrgContext, access: EventAccess, text: string): Promise<RuleDraftResultDto> {
    if (!this.ai.enabled) throw new ConflictException('AI is not available');
    const current = access.event;
    const [run] = await this.db
      .insert(aiRun)
      .values({
        organizationId: org.organizationId,
        eventId: current.id,
        feature: 'rule_drafting',
        trigger: 'on_demand',
        status: 'running',
        requestedByUserId: org.userId,
        startedAt: new Date(),
      })
      .onConflictDoNothing()
      .returning();
    if (!run) throw new ConflictException('Mila is already reading a message for this event');

    try {
      const [teams, applications] = await Promise.all([
        this.planning.listTeams(current.id),
        this.planning.listApplications(current.id),
      ]);
      const context = buildRuleTextContext({
        language: OUTPUT_LANGUAGE,
        event: { name: current.name },
        teams,
        volunteers: applications.map((a) => ({ volunteerId: a.volunteerId, name: a.name })),
        text,
      });
      const result = await this.ai.generate({
        run,
        feature: 'rule_drafting',
        promptVersion: RULE_TEXT_PROMPT_VERSION,
        schema: ruleTextOutputSchema,
        system: RULE_TEXT_SYSTEM,
        prompt: context.prompt,
      });
      const plan = planRuleText(result.output, context);
      await this.runs.setStatus(this.db, run, 'succeeded', {
        model: result.model,
        promptVersion: RULE_TEXT_PROMPT_VERSION,
      });
      return { runId: run.id, ...plan };
    } catch (error) {
      await this.runs.setStatus(this.db, run, 'failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      if (error instanceof AiUnavailableError) {
        throw new ConflictException(
          error.reason === 'cap_reached'
            ? 'The monthly AI budget is used up'
            : 'AI is not available',
        );
      }
      throw error;
    }
  }

  /** Saves the chips the organizer kept, as they set them, all or none. */
  async create(
    org: OrgContext,
    access: EventAccess,
    runId: string,
    input: CreateRulesFromDraftInput,
  ): Promise<void> {
    const [run] = await this.db
      .select()
      .from(aiRun)
      .where(
        and(
          eq(aiRun.id, runId),
          eq(aiRun.eventId, access.event.id),
          eq(aiRun.feature, 'rule_drafting'),
          eq(aiRun.status, 'succeeded'),
        ),
      )
      .limit(1);
    if (!run) throw new NotFoundException('Draft not found');
    await this.db.transaction((tx) =>
      this.rules.createInTransaction(
        tx,
        withSource(org, { type: 'ai_run', id: run.id }),
        access.event,
        input.rules,
        'organizer',
      ),
    );
  }
}
