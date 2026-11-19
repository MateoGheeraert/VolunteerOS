import { Inject, Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, eq, gte, sql } from 'drizzle-orm';
import { ENV, type Env } from '../config/env.js';
import type { Database } from '../db/database.js';
import { aiUsage, type AiTrigger } from '../db/schema/index.js';

/** Runs the organizer didn't start themselves stop at this share of the cap. */
export const PROACTIVE_CAP_SHARE = 0.8;

export type NewUsage = typeof aiUsage.$inferInsert;

export interface UsageSummary {
  monthToDateCents: number;
  capCents: number;
}

/**
 * The AI usage ledger: one row per model call, and the monthly cap per organization. On-demand
 * runs may spend the whole cap; triggered runs stop at 80% so the rest stays for what organizers
 * ask for themselves.
 */
@Injectable()
export class AiUsageService {
  constructor(
    @InjectDrizzle() private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async record(usage: NewUsage): Promise<void> {
    await this.db.insert(aiUsage).values(usage);
  }

  async summary(organizationId: string, now = new Date()): Promise<UsageSummary> {
    const millicents = await this.monthToDateMillicents(organizationId, now);
    return {
      monthToDateCents: Math.ceil(millicents / 1000),
      capCents: this.env.AI_MONTHLY_CAP_CENTS,
    };
  }

  /** Whether the organization may make another call for a run started by `trigger`. */
  async withinCap(organizationId: string, trigger: AiTrigger, now = new Date()): Promise<boolean> {
    const spent = await this.monthToDateMillicents(organizationId, now);
    return isWithinCap(spent, this.env.AI_MONTHLY_CAP_CENTS, trigger);
  }

  private async monthToDateMillicents(organizationId: string, now: Date): Promise<number> {
    const [row] = await this.db
      .select({ total: sql<string>`coalesce(sum(${aiUsage.costMillicents}), 0)` })
      .from(aiUsage)
      .where(
        and(eq(aiUsage.organizationId, organizationId), gte(aiUsage.createdAt, startOfMonth(now))),
      );
    return Number(row?.total ?? 0);
  }
}

/** Pure cap rule, see AiUsageService. */
export function isWithinCap(
  spentMillicents: number,
  capCents: number,
  trigger: AiTrigger,
): boolean {
  const share = trigger === 'on_demand' ? 1 : PROACTIVE_CAP_SHARE;
  return spentMillicents < capCents * 1000 * share;
}

/** The calendar month in Europe/Brussels, where the organizations are. */
export function startOfMonth(now: Date): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Brussels',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === 'year')!.value);
  const month = Number(parts.find((part) => part.type === 'month')!.value);
  // Midnight in Brussels is 22:00 or 23:00 UTC the day before; find the offset on the first.
  const firstUtc = Date.UTC(year, month - 1, 1);
  const offsetMinutes = brusselsOffsetMinutes(new Date(firstUtc));
  return new Date(firstUtc - offsetMinutes * 60_000);
}

function brusselsOffsetMinutes(at: Date): number {
  const name = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Brussels',
    timeZoneName: 'shortOffset',
  })
    .formatToParts(at)
    .find((part) => part.type === 'timeZoneName')!.value; // "GMT+1"
  const match = /GMT([+-]\d+)/.exec(name);
  return match ? Number(match[1]) * 60 : 0;
}
