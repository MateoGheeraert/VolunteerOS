import { Inject, Injectable } from '@nestjs/common';
import { AI_MODEL_RESOLVER, type AiModelResolver } from '../../ai/ai-models.js';
import type { EventAccess } from '../../authz/event-access.service.js';
import type { OrgContext } from '../../authz/org-context.js';
import type { AiSuggestionKind } from '../../db/schema/index.js';
import { isReadOnly } from '../events/event-status.js';
import { todayInBrussels } from '../profile/profile-rules.js';
import { canSeeTask, isUnassigned } from '../tasks/task-rules.js';
import {
  budgetStatus,
  budgetTotals,
  coverage,
  daysUntil,
  isOverdue,
  nextTasks,
  phaseOf,
  planningStatus,
  selectHints,
  statusSuggestion,
  taskStats,
  taskStatus,
} from './overview-rules.js';
import type { DismissHintInput, OverviewDto } from './overview.schemas.js';
import { OverviewRepository } from './overview.repository.js';

/** How many upcoming dates the countdown card lists. */
const MAX_MILESTONES = 2;
const NEXT_TASKS = 3;

/** The event overview: every card's numbers, status and Mila's hints, in one response. */
@Injectable()
export class OverviewService {
  constructor(
    private readonly overview: OverviewRepository,
    @Inject(AI_MODEL_RESOLVER) private readonly ai: AiModelResolver,
  ) {}

  async get(org: OrgContext, access: EventAccess, now = new Date()): Promise<OverviewDto> {
    const { event, canManage } = access;
    const [tasks, pendingRequests, teams, shifts, applications, entries, supplierCount] =
      await Promise.all([
        this.overview.listTasks(event.id),
        canManage ? this.overview.countPendingRequests(event.id) : 0,
        this.overview.listTeams(event.id),
        this.overview.listShifts(event.id),
        this.overview.countApplications(event.id),
        this.overview.listBudgetEntries(event.id),
        this.overview.countSuppliers(event.id),
      ]);

    const phase = phaseOf(event, now);
    const daysToStart = daysUntil(event.startsAt, now);
    const today = todayInBrussels(now);

    // Tasks: counted over the whole event; the list only holds tasks the caller may see.
    const overviewTasks = tasks.map((row) => ({ ...row, assigned: !isUnassigned(row) }));
    const stats = taskStats(overviewTasks, today);
    const viewer = { userId: org.userId, canManage };
    const visible = overviewTasks.filter((row) => canSeeTask(viewer, row));

    // Planning. Volunteers who come for the whole event fill no places: there, the share of
    // them that is placed is what counts.
    const total = coverage(shifts);
    const wholeEvent = event.volunteerCommitment === 'whole_event';
    const planning = {
      status: planningStatus({
        coverage: wholeEvent
          ? { positions: applications.total, filled: applications.assigned, confirmed: 0 }
          : total,
        applications: wholeEvent ? 0 : applications.total,
        phase,
        daysToStart,
      }),
      volunteerCommitment: event.volunteerCommitment,
      shiftCount: shifts.length,
      ...total,
      applications: applications.total,
      assignedVolunteers: applications.assigned,
      unassignedVolunteers: Math.max(0, applications.total - applications.assigned),
      schedulePublishedAt: event.schedulePublishedAt?.toISOString() ?? null,
      teams: teams.map((t) => ({
        id: t.id,
        name: t.name,
        ...coverage(shifts.filter((s) => s.teamId === t.id)),
      })),
    };

    // Budget.
    const totals = budgetTotals(entries);

    // Mila: only for those who may act on what she proposes.
    const milaEnabled = canManage && this.ai.enabled;
    const suggestion = canManage ? statusSuggestion(event, now) : null;
    const [runs, pending, dismissed] = milaEnabled
      ? await Promise.all([
          this.overview.findMissingRuns(event.id),
          this.overview.pendingSuggestions(event.id),
          this.overview.dismissedHints(org.userId, event.id),
        ])
      : [{ running: false, lastFinished: null }, [], new Map<string, string>()];
    const pendingOf = (kinds: AiSuggestionKind[]) =>
      pending.filter((row) => kinds.includes(row.kind)).reduce((sum, row) => sum + row.count, 0);
    const taskSuggestions = pending.find((row) => row.kind === 'task_suggestion');

    return {
      phase,
      daysToStart,
      countdown: {
        createdAt: event.createdAt.toISOString(),
        startsAt: event.startsAt.toISOString(),
        endsAt: event.endsAt.toISOString(),
        milestones: milestones(event, now),
      },
      wrapUp: {
        expectedAttendance: event.expectedAttendance,
        actualAttendance: event.actualAttendance,
        openTasks: stats.total - stats.done,
        hasRetrospective: Boolean(event.retrospective?.trim()),
      },
      tasks: {
        status: taskStatus(stats),
        total: stats.total,
        done: stats.done,
        inProgress: stats.inProgress,
        todo: stats.todo,
        unassigned: stats.unassigned,
        overdue: stats.overdue,
        pendingRequests,
        next: nextTasks(visible, NEXT_TASKS).map((row) => ({
          id: row.id,
          title: row.title,
          status: row.status,
          priority: row.priority,
          dueDate: row.dueDate,
          overdue: isOverdue(row.dueDate, today),
          assigneeName: row.assigneeUserName ?? row.assigneeName,
        })),
      },
      planning,
      budget: {
        status: budgetStatus({ entryCount: entries.length, totals, phase }),
        entryCount: entries.length,
        ...totals,
        supplierCount,
      },
      mila: {
        enabled: milaEnabled,
        findingTasks: runs.running,
        openQuestions: pendingOf(['question', 'update_event']),
        pendingTaskSuggestions: taskSuggestions?.count ?? 0,
        statusSuggestion: suggestion,
        hints: selectHints({
          canManage,
          aiEnabled: this.ai.enabled,
          readOnly: isReadOnly(event.status),
          phase,
          daysToStart,
          now,
          taskCount: stats.total,
          pendingTaskSuggestions: {
            count: taskSuggestions?.count ?? 0,
            newestAt: taskSuggestions?.newestAt ?? null,
          },
          findMissingRunning: runs.running,
          lastFindMissing: runs.lastFinished,
          statusSuggestionShown: suggestion !== null,
          dismissed,
        }),
      },
    };
  }

  /** Puts a hint away for the caller until its situation changes. */
  async dismissHint(org: OrgContext, access: EventAccess, input: DismissHintInput): Promise<void> {
    await this.overview.dismissHint(org.userId, access.event.id, input.hintKey, input.fingerprint);
  }
}

/** Upcoming dates on the countdown: registration closing (while open) and the setup start. */
function milestones(
  event: Pick<
    EventAccess['event'],
    'registrationOpen' | 'registrationDeadline' | 'setupStartsAt' | 'status'
  >,
  now: Date,
) {
  const items: { kind: 'registration_closes' | 'setup_starts'; at: Date }[] = [];
  if (
    event.status === 'published' &&
    event.registrationOpen &&
    event.registrationDeadline &&
    event.registrationDeadline > now
  ) {
    items.push({ kind: 'registration_closes', at: event.registrationDeadline });
  }
  if (event.setupStartsAt && event.setupStartsAt > now) {
    items.push({ kind: 'setup_starts', at: event.setupStartsAt });
  }
  return items
    .toSorted((a, b) => a.at.getTime() - b.at.getTime())
    .slice(0, MAX_MILESTONES)
    .map((item) => ({ kind: item.kind, at: item.at.toISOString() }));
}
