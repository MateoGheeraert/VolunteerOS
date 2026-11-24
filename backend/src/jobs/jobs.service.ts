import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { PgBoss, fromDrizzle, type Job, type Queue } from 'pg-boss';
import { ENV, type Env } from '../config/env.js';
import type { Transaction } from '../db/database.js';

/**
 * Every queue, with its retry policy. A job's data is its queue's type in `JobData`.
 * pg-boss keeps its own tables in the `pgboss` schema; drizzle-kit only manages `public`.
 */
export const QUEUES = {
  /** One AI feature run (src/ai). Retried with backoff; the run row records the outcome. */
  aiRun: {
    name: 'ai-run',
    options: { retryLimit: 3, retryDelay: 15, retryBackoff: true, expireInSeconds: 180 },
  },
  /**
   * Daily: removes deleted and abandoned files from storage (src/features/uploads). Safe to run
   * twice; a failed run is retried, and the next day's run picks up what's left.
   */
  uploadCleanup: {
    name: 'upload-cleanup',
    options: { retryLimit: 2, retryDelay: 300, expireInSeconds: 900 },
  },
} as const satisfies Record<string, { name: string; options: Omit<Queue, 'name'> }>;

export interface JobData {
  aiRun: { runId: string };
  uploadCleanup: Record<string, never>;
}
export type QueueKey = keyof typeof QUEUES;

/**
 * The background job queue (pg-boss on Postgres). Jobs are added inside the caller's transaction
 * (`send(..., { tx })`), so a job exists exactly when the change that caused it was committed.
 *
 * With JOB_WORKERS=off (tests), the queue still accepts jobs but nothing processes them: tests
 * call the job handlers directly.
 */
@Injectable()
export class JobsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JobsService.name);
  private readonly boss: PgBoss;

  constructor(@Inject(ENV) private readonly env: Env) {
    this.boss = new PgBoss({
      connectionString: env.DATABASE_URL_UNPOOLED ?? env.DATABASE_URL,
      schema: 'pgboss',
      max: 4,
      // Tests never process jobs, so they don't need the background maintenance either.
      supervise: env.JOB_WORKERS === 'on',
      schedule: env.JOB_WORKERS === 'on',
    });
    this.boss.on('error', (error) => this.logger.error(error));
  }

  async onModuleInit(): Promise<void> {
    await this.boss.start();
    for (const queue of Object.values(QUEUES)) {
      await this.boss.createQueue(queue.name, queue.options);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.boss.stop({ graceful: true, timeout: 10_000 });
  }

  /** Adds a job, in `tx` when given so it commits or rolls back with the caller's change. */
  async send<K extends QueueKey>(
    queue: K,
    data: JobData[K],
    { tx, singletonKey }: { tx?: Transaction; singletonKey?: string } = {},
  ): Promise<void> {
    await this.boss.send(QUEUES[queue].name, data, {
      singletonKey,
      ...(tx ? { db: fromDrizzle(tx, sql) } : {}),
    });
  }

  /**
   * Adds a job to the queue on a cron schedule (Europe/Brussels). Schedules are stored by pg-boss,
   * so calling this on every boot just keeps them up to date. Nothing is scheduled with
   * JOB_WORKERS=off.
   */
  async schedule<K extends QueueKey>(queue: K, cron: string, data: JobData[K]): Promise<void> {
    if (this.env.JOB_WORKERS === 'off') return;
    await this.boss.schedule(QUEUES[queue].name, cron, data, {
      tz: 'Europe/Brussels',
      // A deploy during the run's minute shouldn't make it skip a day.
      missed: 'once',
    });
  }

  /** Processes the queue's jobs one at a time; a thrown error makes pg-boss retry the job. */
  async work<K extends QueueKey>(
    queue: K,
    handler: (data: JobData[K], job: Job<JobData[K]>) => Promise<void>,
  ): Promise<void> {
    if (this.env.JOB_WORKERS === 'off') return;
    await this.boss.work<JobData[K]>(QUEUES[queue].name, async (jobs) => {
      for (const job of jobs) await handler(job.data, job);
    });
  }
}

/** Whether pg-boss retries the job if this attempt fails. */
export const willRetry = (queue: QueueKey, job: Job<unknown>): boolean =>
  job.retryCount < QUEUES[queue].options.retryLimit;
