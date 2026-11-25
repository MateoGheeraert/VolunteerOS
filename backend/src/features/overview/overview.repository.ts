import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, asc, count, countDistinct, desc, eq, inArray, isNotNull, max } from 'drizzle-orm';
import type { Database } from '../../db/database.js';
import {
  aiRun,
  aiSuggestion,
  assignment,
  budgetEntry,
  milaHintDismissal,
  shift,
  task,
  taskAssignmentRequest,
  team,
  user,
  volunteerApplication,
  type AssignmentStatus,
} from '../../db/schema/index.js';
import { notDeleted } from '../../db/soft-delete.js';

/**
 * Reads for the event overview: just what the cards count, never whole records. Callers pass an
 * already authorized event. Soft-deleted rows are skipped.
 */
@Injectable()
export class OverviewRepository {
  constructor(@InjectDrizzle() private readonly db: Database) {}

  /** The event's tasks, with the name of a member assignee. */
  listTasks(eventId: string) {
    return this.db
      .select({
        id: task.id,
        title: task.title,
        status: task.status,
        priority: task.priority,
        dueDate: task.dueDate,
        assigneeUserId: task.assigneeUserId,
        assigneeName: task.assigneeName,
        assigneeUserName: user.name,
      })
      .from(task)
      .leftJoin(user, eq(user.id, task.assigneeUserId))
      .where(and(eq(task.eventId, eventId), notDeleted(task)));
  }

  async countPendingRequests(eventId: string): Promise<number> {
    const [row] = await this.db
      .select({ value: count() })
      .from(taskAssignmentRequest)
      .innerJoin(task, eq(task.id, taskAssignmentRequest.taskId))
      .where(
        and(
          eq(task.eventId, eventId),
          notDeleted(task),
          eq(taskAssignmentRequest.status, 'pending'),
          notDeleted(taskAssignmentRequest),
        ),
      );
    return row?.value ?? 0;
  }

  listTeams(eventId: string) {
    return this.db
      .select({ id: team.id, name: team.name })
      .from(team)
      .where(and(eq(team.eventId, eventId), notDeleted(team)))
      .orderBy(asc(team.name));
  }

  /** The live shifts with the status of each live assignment on them. */
  async listShifts(eventId: string) {
    const shifts = await this.db
      .select({ id: shift.id, teamId: shift.teamId, capacity: shift.capacity })
      .from(shift)
      .innerJoin(team, and(eq(team.id, shift.teamId), notDeleted(team)))
      .where(and(eq(shift.eventId, eventId), notDeleted(shift)));
    if (shifts.length === 0) return [];

    const assignments = await this.db
      .select({ shiftId: assignment.shiftId, status: assignment.status })
      .from(assignment)
      .innerJoin(
        volunteerApplication,
        and(
          eq(volunteerApplication.id, assignment.applicationId),
          notDeleted(volunteerApplication),
        ),
      )
      .where(
        and(
          inArray(
            assignment.shiftId,
            shifts.map((s) => s.id),
          ),
          notDeleted(assignment),
        ),
      );
    const byShift = new Map<string, AssignmentStatus[]>();
    for (const row of assignments) {
      byShift.set(row.shiftId, [...(byShift.get(row.shiftId) ?? []), row.status]);
    }
    return shifts.map((s) => ({ ...s, assignments: byShift.get(s.id) ?? [] }));
  }

  /** How many volunteers applied, and how many of them have a live shift. */
  async countApplications(eventId: string): Promise<{ total: number; assigned: number }> {
    const [total] = await this.db
      .select({ value: count() })
      .from(volunteerApplication)
      .where(and(eq(volunteerApplication.eventId, eventId), notDeleted(volunteerApplication)));
    const [assigned] = await this.db
      .select({ value: countDistinct(assignment.applicationId) })
      .from(assignment)
      .innerJoin(volunteerApplication, eq(volunteerApplication.id, assignment.applicationId))
      // Like listShifts: a shift of a deleted team doesn't count.
      .innerJoin(shift, and(eq(shift.id, assignment.shiftId), notDeleted(shift)))
      .innerJoin(team, and(eq(team.id, shift.teamId), notDeleted(team)))
      .where(
        and(
          eq(volunteerApplication.eventId, eventId),
          notDeleted(volunteerApplication),
          notDeleted(assignment),
        ),
      );
    return { total: total?.value ?? 0, assigned: assigned?.value ?? 0 };
  }

  listBudgetEntries(eventId: string) {
    return this.db
      .select({
        type: budgetEntry.type,
        estimatedCents: budgetEntry.estimatedCents,
        actualCents: budgetEntry.actualCents,
      })
      .from(budgetEntry)
      .where(and(eq(budgetEntry.eventId, eventId), notDeleted(budgetEntry)));
  }

  async countSuppliers(eventId: string): Promise<number> {
    const [row] = await this.db
      .select({ value: countDistinct(budgetEntry.supplierId) })
      .from(budgetEntry)
      .where(
        and(
          eq(budgetEntry.eventId, eventId),
          notDeleted(budgetEntry),
          isNotNull(budgetEntry.supplierId),
        ),
      );
    return row?.value ?? 0;
  }

  /** The newest task-suggestion runs: the unfinished one (if any) and the last finished one. */
  async findMissingRuns(eventId: string) {
    const runs = await this.db
      .select({ id: aiRun.id, status: aiRun.status, finishedAt: aiRun.finishedAt })
      .from(aiRun)
      .where(and(eq(aiRun.eventId, eventId), eq(aiRun.feature, 'task_suggestions')))
      .orderBy(desc(aiRun.createdAt))
      .limit(10);
    const running = runs.some((run) => run.status === 'queued' || run.status === 'running');
    const finished = runs.find((run) => run.status === 'succeeded' && run.finishedAt !== null);
    return {
      running,
      lastFinished: finished?.finishedAt
        ? { id: finished.id, finishedAt: finished.finishedAt }
        : null,
    };
  }

  /** Pending suggestions per kind, with the newest one's time. */
  pendingSuggestions(eventId: string) {
    return this.db
      .select({ kind: aiSuggestion.kind, count: count(), newestAt: max(aiSuggestion.createdAt) })
      .from(aiSuggestion)
      .where(and(eq(aiSuggestion.eventId, eventId), eq(aiSuggestion.status, 'pending')))
      .groupBy(aiSuggestion.kind);
  }

  async dismissedHints(userId: string, eventId: string): Promise<Map<string, string>> {
    const rows = await this.db
      .select({ key: milaHintDismissal.hintKey, fingerprint: milaHintDismissal.fingerprint })
      .from(milaHintDismissal)
      .where(and(eq(milaHintDismissal.userId, userId), eq(milaHintDismissal.eventId, eventId)));
    return new Map(rows.map((row) => [row.key, row.fingerprint]));
  }

  /** Stores (or replaces) the user's dismissal of a hint in its current situation. */
  async dismissHint(userId: string, eventId: string, hintKey: string, fingerprint: string) {
    await this.db
      .insert(milaHintDismissal)
      .values({ userId, eventId, hintKey, fingerprint })
      .onConflictDoUpdate({
        target: [milaHintDismissal.userId, milaHintDismissal.eventId, milaHintDismissal.hintKey],
        set: { fingerprint, dismissedAt: new Date() },
      });
  }
}
