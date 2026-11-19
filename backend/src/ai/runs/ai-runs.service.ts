import { Inject, Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, desc, eq, inArray, lt } from 'drizzle-orm';
import { ENV, type Env } from '../../config/env.js';
import type { Database, DbExecutor, Transaction } from '../../db/database.js';
import {
  aiRun,
  type AiFeature,
  type AiRunRow,
  type AiRunStatus,
  type AiTrigger,
} from '../../db/schema/index.js';
import { JobsService } from '../../jobs/jobs.service.js';
import { LiveUpdatesService } from '../../jobs/live-updates.service.js';

/**
 * After this long an unfinished run counts as lost: well beyond every retry of its job
 * (4 attempts of at most 3 minutes, plus backoff).
 */
const STUCK_AFTER_MS = 30 * 60_000;

export interface RunRequest {
  organizationId: string;
  eventId: string;
  feature: AiFeature;
  trigger: AiTrigger;
  requestedByUserId: string | null;
}

/**
 * Queues AI runs. A run row and its job are written in one transaction (the caller's, when it
 * passes one), so a run is queued exactly when the change that caused it commits. An event never
 * has two unfinished runs of the same feature: asking again returns the one already queued.
 */
@Injectable()
export class AiRunsService {
  constructor(
    @InjectDrizzle() private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    private readonly jobs: JobsService,
    private readonly live: LiveUpdatesService,
  ) {}

  /** Whether AI is on at all; without a key no runs are queued. */
  get enabled(): boolean {
    return this.env.OPENAI_API_KEY !== undefined;
  }

  /** The queued run, the unfinished one already there, or null when AI is off. */
  async enqueue(request: RunRequest, tx?: Transaction): Promise<AiRunRow | null> {
    if (!this.enabled) return null;
    if (!tx) return this.db.transaction((own) => this.enqueue(request, own));

    await this.failStuck(tx, request);
    // The partial unique index keeps one unfinished run per event and feature, also when two
    // requests race; doing nothing on conflict keeps the caller's transaction usable.
    const [run] = await tx.insert(aiRun).values(request).onConflictDoNothing().returning();
    if (!run) {
      const [unfinished] = await tx.select().from(aiRun).where(this.unfinishedOf(request)).limit(1);
      return unfinished ?? null;
    }
    await this.jobs.send('aiRun', { runId: run.id }, { tx });
    await this.live.publish(tx, {
      type: 'ai_run',
      eventId: request.eventId,
      runId: run.id,
      status: 'queued',
    });
    return run;
  }

  /**
   * A run unfinished for much longer than its job may take was lost (the process stopped during
   * its last attempt). Without this, it would block every later run of the event.
   */
  private async failStuck(tx: Transaction, request: RunRequest): Promise<void> {
    const stuckBefore = new Date(Date.now() - STUCK_AFTER_MS);
    const stuck = await tx
      .update(aiRun)
      .set({ status: 'failed', error: 'lost: no result in time', finishedAt: new Date() })
      .where(and(this.unfinishedOf(request), lt(aiRun.createdAt, stuckBefore)))
      .returning();
    for (const run of stuck) {
      await this.live.publish(tx, {
        type: 'ai_run',
        eventId: run.eventId,
        runId: run.id,
        status: 'failed',
      });
    }
  }

  private unfinishedOf(request: RunRequest) {
    return and(
      eq(aiRun.eventId, request.eventId),
      eq(aiRun.feature, request.feature),
      inArray(aiRun.status, ['queued', 'running']),
    );
  }

  async find(runId: string): Promise<AiRunRow | undefined> {
    const [row] = await this.db.select().from(aiRun).where(eq(aiRun.id, runId)).limit(1);
    return row;
  }

  /** The event's latest run of each feature, newest first. */
  latestForEvent(eventId: string): Promise<AiRunRow[]> {
    return this.db
      .selectDistinctOn([aiRun.feature])
      .from(aiRun)
      .where(eq(aiRun.eventId, eventId))
      .orderBy(aiRun.feature, desc(aiRun.createdAt));
  }

  async setStatus(
    db: DbExecutor,
    run: AiRunRow,
    status: AiRunStatus,
    details: Partial<Pick<AiRunRow, 'model' | 'promptVersion' | 'error'>> = {},
  ): Promise<void> {
    const now = new Date();
    await db
      .update(aiRun)
      .set({
        status,
        ...details,
        ...(status === 'running' ? { startedAt: now } : {}),
        ...(status === 'succeeded' || status === 'failed' ? { finishedAt: now } : {}),
      })
      .where(eq(aiRun.id, run.id));
    await this.live.publish(db, { type: 'ai_run', eventId: run.eventId, runId: run.id, status });
  }
}
