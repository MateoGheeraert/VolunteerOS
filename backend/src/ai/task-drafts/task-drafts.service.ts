import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, asc, eq } from 'drizzle-orm';
import { withSource } from '../../activity/activity-log.js';
import type { EventAccess } from '../../authz/event-access.service.js';
import type { OrgContext } from '../../authz/org-context.js';
import type { Database } from '../../db/database.js';
import { aiRun, member, task, user } from '../../db/schema/index.js';
import { notDeleted } from '../../db/soft-delete.js';
import { todayInBrussels as brusselsDate } from '../../features/profile/profile-rules.js';
import { TasksService } from '../../features/tasks/tasks.service.js';
import { AiClient, AiUnavailableError } from '../ai-client.service.js';
import type { CreateDraftTasksInput, TaskDraftDto } from '../ai.schemas.js';
import { AiRunsService } from '../runs/ai-runs.service.js';
import { buildTaskDraftContext } from './task-drafts.context.js';
import { planTaskDrafts } from './task-drafts.plan.js';
import { TASK_DRAFTS_PROMPT_VERSION, TASK_DRAFTS_SYSTEM } from './task-drafts.prompt.js';
import { taskDraftOutputSchema } from './task-drafts.schema.js';

const OUTPUT_LANGUAGE = 'nl-BE';

/**
 * "Help me taken maken": Mila turns the organizer's own list into tasks while they wait, and the
 * organizer creates the ones they keep in one go. Nothing is created before they confirm; the
 * activity log then records the drafting run as the tasks' source.
 *
 * Routes have already authorized the event for 'manage'.
 */
@Injectable()
export class TaskDraftsService {
  constructor(
    @InjectDrizzle() private readonly db: Database,
    private readonly ai: AiClient,
    private readonly runs: AiRunsService,
    private readonly tasks: TasksService,
  ) {}

  async draft(org: OrgContext, access: EventAccess, text: string): Promise<TaskDraftDto> {
    if (!this.ai.enabled) throw new ConflictException('AI is not available');
    const current = access.event;

    // A run row books the usage and is the source of the tasks created from it. The unfinished
    // index allows one drafting run per event at a time.
    const [run] = await this.db
      .insert(aiRun)
      .values({
        organizationId: org.organizationId,
        eventId: current.id,
        feature: 'task_drafting',
        trigger: 'on_demand',
        status: 'running',
        requestedByUserId: org.userId,
        startedAt: new Date(),
      })
      .onConflictDoNothing()
      .returning();
    if (!run) throw new ConflictException('Mila is already working on a list for this event');

    try {
      const [members, currentTasks] = await Promise.all([
        this.listMembers(org.organizationId),
        this.listTaskTitles(current.id),
      ]);
      const { prompt, memberRefs } = buildTaskDraftContext({
        language: OUTPUT_LANGUAGE,
        today: brusselsDate(new Date()),
        event: {
          name: current.name,
          startDate: brusselsDate(current.startsAt),
          endDate: brusselsDate(current.endsAt),
        },
        members,
        currentTasks,
        text,
      });
      const result = await this.ai.generate({
        run,
        feature: 'task_drafting',
        promptVersion: TASK_DRAFTS_PROMPT_VERSION,
        schema: taskDraftOutputSchema,
        system: TASK_DRAFTS_SYSTEM,
        prompt,
      });
      const { tasks } = planTaskDrafts(result.output, memberRefs, {
        existingTaskTitles: currentTasks.map((row) => row.title),
      });
      await this.runs.setStatus(this.db, run, 'succeeded', {
        model: result.model,
        promptVersion: TASK_DRAFTS_PROMPT_VERSION,
      });
      return { runId: run.id, tasks };
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

  /** Creates the drafted tasks the organizer kept (as they edited them), all or none. */
  async create(
    org: OrgContext,
    access: EventAccess,
    runId: string,
    input: CreateDraftTasksInput,
  ): Promise<void> {
    const [run] = await this.db
      .select()
      .from(aiRun)
      .where(
        and(
          eq(aiRun.id, runId),
          eq(aiRun.eventId, access.event.id),
          eq(aiRun.feature, 'task_drafting'),
          eq(aiRun.status, 'succeeded'),
        ),
      )
      .limit(1);
    if (!run) throw new NotFoundException('Draft not found');
    const scope = withSource(org, { type: 'ai_run', id: run.id });
    await this.db.transaction(async (tx) => {
      for (const item of input.tasks) {
        await this.tasks.createInTransaction(tx, scope, access, item);
      }
    });
  }

  private listMembers(organizationId: string) {
    return this.db
      .select({ userId: user.id, name: user.name })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(eq(member.organizationId, organizationId))
      .orderBy(asc(user.name));
  }

  private listTaskTitles(eventId: string) {
    return this.db
      .select({ title: task.title })
      .from(task)
      .where(and(eq(task.eventId, eventId), notDeleted(task)))
      .orderBy(asc(task.createdAt));
  }
}
