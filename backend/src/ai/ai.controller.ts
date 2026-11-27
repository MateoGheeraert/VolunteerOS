import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  type MessageEvent,
  Param,
  ParseUUIDPipe,
  Post,
  Sse,
} from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { interval, map, merge, type Observable } from 'rxjs';
import { z } from 'zod';
import {
  CurrentEventAccess,
  OrgScoped,
  RequireEventAccess,
  RequireOrgAdmin,
} from '../authz/authz.decorators.js';
import type { EventAccess } from '../authz/event-access.service.js';
import { CurrentOrg, type OrgContext } from '../authz/org-context.js';
import { LiveUpdatesService } from '../jobs/live-updates.service.js';
import { AiUsageService } from './ai-usage.service.js';
import {
  acceptBudgetLinesSchema,
  acceptEventUpdateSchema,
  acceptTaskSuggestionsSchema,
  aiEventStateSchema,
  aiMemorySchema,
  aiRunSchema,
  aiUsageSchema,
  answerQuestionSchema,
  createDraftTasksSchema,
  draftTasksSchema,
  markSeenSchema,
  taskDraftSchema,
  type AcceptBudgetLinesInput,
  type AcceptEventUpdateInput,
  type AcceptTaskSuggestionsInput,
  type AnswerQuestionInput,
  type CreateDraftTasksInput,
  type DraftTasksInput,
  type MarkSeenInput,
  requestBudgetReviewSchema,
  type RequestBudgetReviewInput,
} from './ai.schemas.js';
import { AiMemoryService } from './suggestions/ai-memory.service.js';
import { AiSuggestionsService } from './suggestions/ai-suggestions.service.js';
import { TaskDraftsService } from './task-drafts/task-drafts.service.js';

const uuid = new ParseUUIDPipe({ errorHttpStatusCode: 404 });

/** Keeps idle streams open through proxies that close silent connections. */
const HEARTBEAT_MS = 25_000;

/**
 * The agent on one event: its state, asking for suggestions, deciding on them, and a live stream
 * of updates. Suggestions change the event, so everything here needs 'manage'.
 */
@ApiTags('ai')
@OrgScoped()
@Controller('events/:eventId/ai')
export class AiEventController {
  constructor(
    private readonly suggestions: AiSuggestionsService,
    private readonly drafts: TaskDraftsService,
    private readonly live: LiveUpdatesService,
  ) {}

  @Get()
  @RequireEventAccess('manage')
  @ApiResponse({ status: 200, standardSchema: aiEventStateSchema })
  state(@CurrentEventAccess() access: EventAccess) {
    return this.suggestions.state(access);
  }

  /** Queues a task-suggestion run; the result arrives on the stream. */
  @Post('task-suggestions')
  @HttpCode(202)
  @RequireEventAccess('manage')
  @ApiResponse({ status: 202, standardSchema: aiRunSchema })
  requestTaskSuggestions(@CurrentOrg() org: OrgContext, @CurrentEventAccess() access: EventAccess) {
    return this.suggestions.requestTaskSuggestions(org, access);
  }

  /** Queues a budget review ("Mila, bekijk mijn begroting"); the result arrives on the stream. */
  @Post('budget-review')
  @HttpCode(202)
  @RequireEventAccess('manage')
  @ApiResponse({ status: 202, standardSchema: aiRunSchema })
  requestBudgetReview(
    @CurrentOrg() org: OrgContext,
    @CurrentEventAccess() access: EventAccess,
    @Body({ schema: requestBudgetReviewSchema }) body: RequestBudgetReviewInput,
  ) {
    return this.suggestions.requestBudgetReview(org, access, body.instruction);
  }

  /** Mila turns the organizer's own list into tasks to check; nothing is created yet. */
  @Post('task-drafts')
  @HttpCode(200)
  @RequireEventAccess('manage')
  @ApiResponse({ status: 200, standardSchema: taskDraftSchema })
  draftTasks(
    @CurrentOrg() org: OrgContext,
    @CurrentEventAccess() access: EventAccess,
    @Body({ schema: draftTasksSchema }) body: DraftTasksInput,
  ) {
    return this.drafts.draft(org, access, body.text);
  }

  /** Creates the drafted tasks the organizer kept, as they edited them. */
  @Post('task-drafts/:runId/tasks')
  @HttpCode(204)
  @RequireEventAccess('manage')
  createDraftTasks(
    @CurrentOrg() org: OrgContext,
    @CurrentEventAccess() access: EventAccess,
    @Param('runId', uuid) runId: string,
    @Body({ schema: createDraftTasksSchema }) body: CreateDraftTasksInput,
  ) {
    return this.drafts.create(org, access, runId, body);
  }

  @Post('suggestions/accept-tasks')
  @HttpCode(204)
  @RequireEventAccess('manage')
  acceptTasks(
    @CurrentOrg() org: OrgContext,
    @CurrentEventAccess() access: EventAccess,
    @Body({ schema: acceptTaskSuggestionsSchema }) body: AcceptTaskSuggestionsInput,
  ) {
    return this.suggestions.acceptTasks(org, access, body);
  }

  @Post('suggestions/accept-budget-lines')
  @HttpCode(204)
  @RequireEventAccess('manage')
  acceptBudgetLines(
    @CurrentOrg() org: OrgContext,
    @CurrentEventAccess() access: EventAccess,
    @Body({ schema: acceptBudgetLinesSchema }) body: AcceptBudgetLinesInput,
  ) {
    return this.suggestions.acceptBudgetLines(org, access, body);
  }

  @Post('suggestions/:suggestionId/accept-update')
  @HttpCode(204)
  @RequireEventAccess('manage')
  acceptEventUpdate(
    @CurrentOrg() org: OrgContext,
    @CurrentEventAccess() access: EventAccess,
    @Param('suggestionId', uuid) suggestionId: string,
    @Body({ schema: acceptEventUpdateSchema }) body: AcceptEventUpdateInput,
  ) {
    return this.suggestions.acceptEventUpdate(org, access, suggestionId, body);
  }

  @Post('suggestions/:suggestionId/answer')
  @HttpCode(204)
  @RequireEventAccess('manage')
  answer(
    @CurrentOrg() org: OrgContext,
    @CurrentEventAccess() access: EventAccess,
    @Param('suggestionId', uuid) suggestionId: string,
    @Body({ schema: answerQuestionSchema }) body: AnswerQuestionInput,
  ) {
    return this.suggestions.answer(org, access, suggestionId, body);
  }

  @Post('suggestions/:suggestionId/reject')
  @HttpCode(204)
  @RequireEventAccess('manage')
  reject(
    @CurrentOrg() org: OrgContext,
    @CurrentEventAccess() access: EventAccess,
    @Param('suggestionId', uuid) suggestionId: string,
  ) {
    return this.suggestions.reject(org, access, suggestionId);
  }

  @Post('suggestions/seen')
  @HttpCode(204)
  @RequireEventAccess('manage')
  markSeen(
    @CurrentEventAccess() access: EventAccess,
    @Body({ schema: markSeenSchema }) body: MarkSeenInput,
  ) {
    return this.suggestions.markSeen(access, body.suggestionIds);
  }

  /**
   * Server-Sent Events: `ai_run` when a run is queued, starts or ends, `ai_suggestions` when the
   * suggestions changed (refetch the state), and a `ping` now and then.
   */
  @Sse('stream')
  @RequireEventAccess('manage')
  stream(@CurrentEventAccess() access: EventAccess): Observable<MessageEvent> {
    return merge(
      this.live
        .forEvent(access.event.id)
        .pipe(map((update) => ({ type: update.type, data: update }))),
      interval(HEARTBEAT_MS).pipe(map(() => ({ type: 'ping', data: {} }))),
    );
  }
}

/** Organization-wide: the agent's memory (owners and admins) and its budget (owners). */
@ApiTags('ai')
@OrgScoped()
@Controller('ai')
export class AiOrganizationController {
  constructor(
    private readonly memory: AiMemoryService,
    private readonly usage: AiUsageService,
  ) {}

  @Get('memory')
  @RequireOrgAdmin()
  @ApiResponse({ status: 200, standardSchema: z.array(aiMemorySchema) })
  listMemory(@CurrentOrg() org: OrgContext) {
    return this.memory.list(org);
  }

  @Delete('memory/:memoryId')
  @HttpCode(204)
  @RequireOrgAdmin()
  removeMemory(@CurrentOrg() org: OrgContext, @Param('memoryId', uuid) memoryId: string) {
    return this.memory.remove(org, memoryId);
  }

  @Get('usage')
  @ApiResponse({ status: 200, standardSchema: aiUsageSchema })
  usageSummary(@CurrentOrg() org: OrgContext) {
    if (org.role !== 'owner') throw new ForbiddenException();
    return this.usage.summary(org.organizationId);
  }
}
