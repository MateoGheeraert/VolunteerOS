import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import type { Job } from 'pg-boss';
import type { Database } from '../../db/database.js';
import type { AiRunRow } from '../../db/schema/index.js';
import { JobsService, willRetry, type JobData } from '../../jobs/jobs.service.js';
import { AiUnavailableError } from '../ai-client.service.js';
import { PromotionPlanRunner } from '../promotion-plan/promotion-plan.runner.js';
import {
  EventGoneError,
  TaskSuggestionsRunner,
} from '../task-suggestions/task-suggestions.runner.js';
import { AiRunsService } from './ai-runs.service.js';

/**
 * Processes queued AI runs. A run that fails because AI is off or the budget is used up fails
 * right away; any other failure is retried by the queue with backoff, and the run is marked
 * failed after the last attempt. The organizer always keeps the app without new suggestions.
 */
@Injectable()
export class AiRunWorker implements OnApplicationBootstrap {
  private readonly logger = new Logger(AiRunWorker.name);

  constructor(
    @InjectDrizzle() private readonly db: Database,
    private readonly jobs: JobsService,
    private readonly runs: AiRunsService,
    private readonly taskSuggestions: TaskSuggestionsRunner,
    private readonly promotionPlan: PromotionPlanRunner,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.jobs.work('aiRun', (data, job) => this.handle(data, job));
  }

  /** Public so tests and scripts can process a run without the queue. */
  async handle(data: JobData['aiRun'], job?: Job<JobData['aiRun']>): Promise<void> {
    const run = await this.runs.find(data.runId);
    if (!run || run.status === 'succeeded' || run.status === 'failed') return;
    await this.runs.setStatus(this.db, run, 'running');
    try {
      const result = await this.execute(run);
      await this.runs.setStatus(this.db, run, 'succeeded', result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // AiClient already retried and fell back, so its errors are final, as is a deleted event.
      // Only unexpected errors (the database, a bug) are worth another attempt.
      const final = error instanceof AiUnavailableError || error instanceof EventGoneError;
      const retry = !final && job !== undefined && willRetry('aiRun', job);
      if (retry) {
        await this.runs.setStatus(this.db, run, 'queued', { error: message });
        throw error;
      }
      this.logger.warn(`AI run ${run.id} failed: ${message}`);
      await this.runs.setStatus(this.db, run, 'failed', { error: message });
    }
  }

  private execute(run: AiRunRow): Promise<{ model: string; promptVersion: string }> {
    switch (run.feature) {
      case 'task_suggestions':
        return this.taskSuggestions.run(run);
      case 'task_drafting':
        // Drafting runs while the organizer waits (TaskDraftsService), never as a job.
        throw new AiUnavailableError('failed', 'task_drafting runs are not queued');
      case 'promotion_plan':
        return this.promotionPlan.run(run);
    }
  }
}
