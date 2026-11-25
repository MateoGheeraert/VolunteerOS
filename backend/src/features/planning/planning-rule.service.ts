import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, asc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { recordActivity, type ActivityScope } from '../../activity/activity-log.js';
import type { OrgContext } from '../../authz/org-context.js';
import type { Database, DbExecutor } from '../../db/database.js';
import {
  planningRule,
  volunteer,
  type EventRow,
  type PlanningRuleRow,
  type PlanningRuleSource,
} from '../../db/schema/index.js';
import { notDeleted } from '../../db/soft-delete.js';
import { assertWritable } from './planning.mappers.js';
import { PlanningRepository } from './planning.repository.js';
import type { CreatePlanningRuleInput, PlanningRuleDto } from './planning-rule.schemas.js';

/** Ids, kinds and settings: no free text about the person. */
const RULE_LOGGED_VALUES = [
  'kind',
  'volunteerId',
  'otherVolunteerId',
  'teamName',
  'maxShifts',
  'time',
  'source',
  'copiedFromId',
] as const;

const DUPLICATE = 'This rule already exists';

/**
 * Planning rules (docs/info.md §7.7.1 B). Person rules live at organization level, event rules on
 * one event. On an event the organizer sees its own rules plus the organization rules about its
 * volunteers. Routes have already authorized the event for 'manage'.
 */
@Injectable()
export class PlanningRuleService {
  constructor(
    @InjectDrizzle() private readonly db: Database,
    private readonly planning: PlanningRepository,
  ) {}

  async list(org: OrgContext, event: EventRow): Promise<PlanningRuleDto[]> {
    const applications = await this.planning.listApplications(event.id);
    const rows = await this.rulesFor(
      this.db,
      org.organizationId,
      event.id,
      applications.map((a) => a.volunteerId),
    );
    return this.toDtos(rows);
  }

  /**
   * The live rules that apply on the event: its own, and the organization's about any of
   * `volunteerIds`. Also what the allocation reads.
   */
  rulesFor(
    db: DbExecutor,
    organizationId: string,
    eventId: string,
    volunteerIds: string[],
  ): Promise<PlanningRuleRow[]> {
    const aboutVolunteers =
      volunteerIds.length === 0
        ? sql`false`
        : or(
            inArray(planningRule.volunteerId, volunteerIds),
            inArray(planningRule.otherVolunteerId, volunteerIds),
          );
    return db
      .select()
      .from(planningRule)
      .where(
        and(
          eq(planningRule.organizationId, organizationId),
          notDeleted(planningRule),
          or(eq(planningRule.eventId, eventId), and(isNull(planningRule.eventId), aboutVolunteers)),
        ),
      )
      .orderBy(asc(planningRule.createdAt));
  }

  async create(org: OrgContext, event: EventRow, input: CreatePlanningRuleInput): Promise<void> {
    assertWritable(event);
    await this.db.transaction((tx) =>
      this.createInTransaction(tx, org, event, [input], 'organizer'),
    );
  }

  /**
   * Creates rules in the caller's transaction (accepting Mila's chips and cards). Both people
   * must be on the event's list; an identical live rule is refused.
   */
  async createInTransaction(
    tx: DbExecutor,
    scope: ActivityScope & { organizationId: string; userId: string },
    event: EventRow,
    inputs: CreatePlanningRuleInput[],
    source: PlanningRuleSource,
  ): Promise<PlanningRuleRow[]> {
    assertWritable(event);
    await this.assertOnList(event, inputs);
    const created: PlanningRuleRow[] = [];
    for (const input of inputs) {
      const values = toValues(scope.organizationId, event.id, input);
      if (await this.findDuplicate(tx, values)) throw new ConflictException(DUPLICATE);
      const [row] = await tx
        .insert(planningRule)
        .values({ ...values, source, createdByUserId: scope.userId })
        .returning();
      await recordActivity(tx, scope, {
        action: 'created',
        entityType: 'planning_rule',
        entity: row!,
        before: null,
        eventId: event.id,
        values: RULE_LOGGED_VALUES,
      });
      created.push(row!);
    }
    return created;
  }

  async update(
    org: OrgContext,
    event: EventRow,
    ruleId: string,
    input: CreatePlanningRuleInput,
  ): Promise<void> {
    assertWritable(event);
    const current = await this.find(org, event, ruleId);
    await this.assertOnList(event, [input]);
    const values = toValues(org.organizationId, event.id, input);
    await this.db.transaction(async (tx) => {
      if (await this.findDuplicate(tx, values, current.id)) throw new ConflictException(DUPLICATE);
      const [updated] = await tx
        .update(planningRule)
        .set(values)
        .where(eq(planningRule.id, current.id))
        .returning();
      await recordActivity(tx, org, {
        action: 'updated',
        entityType: 'planning_rule',
        entity: updated!,
        before: current,
        eventId: event.id,
        values: RULE_LOGGED_VALUES,
      });
    });
  }

  async remove(org: OrgContext, event: EventRow, ruleId: string): Promise<void> {
    assertWritable(event);
    const current = await this.find(org, event, ruleId);
    await this.db.transaction(async (tx) => {
      const [removed] = await tx
        .update(planningRule)
        .set({ deletedAt: new Date() })
        .where(eq(planningRule.id, current.id))
        .returning();
      await recordActivity(tx, org, {
        action: 'deleted',
        entityType: 'planning_rule',
        entity: removed!,
        eventId: event.id,
      });
    });
  }

  /** A rule the organizer may see on this event (see `list`). */
  private async find(org: OrgContext, event: EventRow, ruleId: string): Promise<PlanningRuleRow> {
    const applications = await this.planning.listApplications(event.id);
    const rows = await this.rulesFor(
      this.db,
      org.organizationId,
      event.id,
      applications.map((a) => a.volunteerId),
    );
    const row = rows.find((rule) => rule.id === ruleId);
    if (!row) throw new NotFoundException('Rule not found');
    return row;
  }

  private async assertOnList(event: EventRow, inputs: CreatePlanningRuleInput[]) {
    const onList = new Set(
      (await this.planning.listApplications(event.id)).map((a) => a.volunteerId),
    );
    for (const input of inputs) {
      if (!onList.has(input.volunteerId)) {
        throw new BadRequestException('volunteerId: not on this event');
      }
      if (input.otherVolunteerId && !onList.has(input.otherVolunteerId)) {
        throw new BadRequestException('otherVolunteerId: not on this event');
      }
    }
  }

  private async findDuplicate(
    db: DbExecutor,
    values: ReturnType<typeof toValues>,
    exceptId?: string,
  ): Promise<boolean> {
    const samePeople = values.otherVolunteerId
      ? or(
          and(
            eq(planningRule.volunteerId, values.volunteerId),
            eq(planningRule.otherVolunteerId, values.otherVolunteerId),
          ),
          and(
            eq(planningRule.volunteerId, values.otherVolunteerId),
            eq(planningRule.otherVolunteerId, values.volunteerId),
          ),
        )
      : eq(planningRule.volunteerId, values.volunteerId);
    const [row] = await db
      .select({ id: planningRule.id })
      .from(planningRule)
      .where(
        and(
          eq(planningRule.organizationId, values.organizationId),
          values.eventId ? eq(planningRule.eventId, values.eventId) : isNull(planningRule.eventId),
          eq(planningRule.kind, values.kind),
          samePeople,
          sql`lower(coalesce(${planningRule.teamName}, '')) = lower(${values.teamName ?? ''})`,
          sql`coalesce(${planningRule.maxShifts}, -1) = ${values.maxShifts ?? -1}`,
          sql`coalesce(${planningRule.time}, '') = ${values.time ?? ''}`,
          notDeleted(planningRule),
          exceptId ? sql`${planningRule.id} <> ${exceptId}` : undefined,
        ),
      )
      .limit(1);
    return row !== undefined;
  }

  private async toDtos(rows: PlanningRuleRow[]): Promise<PlanningRuleDto[]> {
    const ids = [...new Set(rows.flatMap((r) => [r.volunteerId, r.otherVolunteerId ?? []]).flat())];
    const people =
      ids.length === 0
        ? []
        : await this.db
            .select({ id: volunteer.id, name: volunteer.name })
            .from(volunteer)
            .where(inArray(volunteer.id, ids));
    const nameOf = new Map(people.map((p) => [p.id, p.name]));
    const person = (id: string) => ({ id, name: nameOf.get(id) ?? '' });
    return rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      scope: row.eventId ? 'event' : 'organization',
      volunteer: person(row.volunteerId),
      otherVolunteer: row.otherVolunteerId ? person(row.otherVolunteerId) : null,
      teamName: row.teamName,
      maxShifts: row.maxShifts,
      time: row.time,
      source: row.source,
      copiedFromPreviousEdition: row.copiedFromId !== null,
      createdAt: row.createdAt.toISOString(),
    }));
  }
}

function toValues(organizationId: string, eventId: string, input: CreatePlanningRuleInput) {
  return {
    organizationId,
    eventId: input.scope === 'event' ? eventId : null,
    kind: input.kind,
    volunteerId: input.volunteerId,
    otherVolunteerId: input.otherVolunteerId ?? null,
    teamName: input.teamName?.trim() || null,
    maxShifts: input.maxShifts ?? null,
    time: input.time ?? null,
  };
}

/**
 * Copies the previous edition's event rules to the new edition, in the transaction that creates
 * it (docs/info.md §7.7.1 B). Organization rules need no copy: they hold everywhere.
 */
export async function copyEditionRules(
  tx: DbExecutor,
  scope: OrgContext,
  fromEventId: string,
  toEventId: string,
): Promise<void> {
  const previous = await tx
    .select()
    .from(planningRule)
    .where(
      and(
        eq(planningRule.organizationId, scope.organizationId),
        eq(planningRule.eventId, fromEventId),
        notDeleted(planningRule),
      ),
    );
  if (previous.length === 0) return;
  const copies = await tx
    .insert(planningRule)
    .values(
      previous.map((rule) => ({
        organizationId: rule.organizationId,
        eventId: toEventId,
        kind: rule.kind,
        volunteerId: rule.volunteerId,
        otherVolunteerId: rule.otherVolunteerId,
        teamName: rule.teamName,
        maxShifts: rule.maxShifts,
        time: rule.time,
        source: rule.source,
        copiedFromId: rule.id,
        createdByUserId: scope.userId,
      })),
    )
    .returning();
  for (const row of copies) {
    await recordActivity(tx, scope, {
      action: 'created',
      entityType: 'planning_rule',
      entity: row,
      before: null,
      eventId: toEventId,
      values: RULE_LOGGED_VALUES,
    });
  }
}
