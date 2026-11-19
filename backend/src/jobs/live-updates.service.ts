import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { sql } from 'drizzle-orm';
import pg from 'pg';
import { filter, Subject, type Observable } from 'rxjs';
import { ENV, type Env } from '../config/env.js';
import type { DbExecutor } from '../db/database.js';

const CHANNEL = 'live_update';

/**
 * Something that changed for an event, pushed to the organizers who have its page open:
 * - `ai_run`: an AI run was queued, started or finished.
 * - `ai_suggestions`: the event's suggestions changed; refetch them.
 */
export type LiveUpdate =
  | { type: 'ai_run'; eventId: string; runId: string; status: string }
  | { type: 'ai_suggestions'; eventId: string };

/**
 * Pushes updates to every backend instance with Postgres LISTEN/NOTIFY, so a job finishing in one
 * instance reaches the browser streams held open by another. `publish` inside a transaction is
 * delivered when it commits, and never if it rolls back.
 */
@Injectable()
export class LiveUpdatesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LiveUpdatesService.name);
  private readonly updates = new Subject<LiveUpdate>();
  private client: pg.Client | undefined;
  private closing = false;

  constructor(@Inject(ENV) private readonly env: Env) {}

  async onModuleInit(): Promise<void> {
    await this.listen();
  }

  async onModuleDestroy(): Promise<void> {
    this.closing = true;
    this.updates.complete();
    await this.client?.end().catch(() => undefined);
  }

  async publish(db: DbExecutor, update: LiveUpdate): Promise<void> {
    await db.execute(sql`select pg_notify(${CHANNEL}, ${JSON.stringify(update)})`);
  }

  /** The updates of one event. */
  forEvent(eventId: string): Observable<LiveUpdate> {
    return this.updates.pipe(filter((update) => update.eventId === eventId));
  }

  /** A dedicated session on the direct connection: LISTEN doesn't work through the pooler. */
  private async listen(): Promise<void> {
    const client = new pg.Client({
      connectionString: this.env.DATABASE_URL_UNPOOLED ?? this.env.DATABASE_URL,
    });
    client.on('notification', (message) => {
      if (message.channel !== CHANNEL || !message.payload) return;
      try {
        this.updates.next(JSON.parse(message.payload) as LiveUpdate);
      } catch (error) {
        this.logger.warn(`Ignoring malformed live update: ${String(error)}`);
      }
    });
    client.on('error', (error) => {
      // Only the current client reconnects, and only once: a client can emit several errors.
      if (client !== this.client) return;
      this.client = undefined;
      this.logger.error(`Live updates connection lost: ${error.message}`);
      void client.end().catch(() => undefined);
      void this.reconnect();
    });
    try {
      await client.connect();
      await client.query(`listen ${CHANNEL}`);
    } catch (error) {
      await client.end().catch(() => undefined);
      throw error;
    }
    this.client = client;
  }

  /** Retries until a new listening session is up (or the app shuts down). */
  private async reconnect(): Promise<void> {
    while (!this.closing) {
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      if (this.closing) return;
      try {
        await this.listen();
        return;
      } catch (error) {
        this.logger.error(`Live updates reconnect failed: ${String(error)}`);
      }
    }
  }
}
