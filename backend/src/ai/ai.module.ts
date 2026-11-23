import { Module } from '@nestjs/common';
import { ENV, type Env } from '../config/env.js';
import { EventsModule } from '../features/events/events.module.js';
import { TasksModule } from '../features/tasks/tasks.module.js';
import { AiClient } from './ai-client.service.js';
import { AI_MODEL_RESOLVER, createModelResolver } from './ai-models.js';
import { AiUsageService } from './ai-usage.service.js';
import { AiEventController, AiOrganizationController } from './ai.controller.js';
import { AiRunWorker } from './runs/ai-run-worker.service.js';
import { AiRunsModule } from './runs/ai-runs.module.js';
import { AiMemoryService } from './suggestions/ai-memory.service.js';
import { AiSuggestionsRepository } from './suggestions/ai-suggestions.repository.js';
import { AiSuggestionsService } from './suggestions/ai-suggestions.service.js';
import { TaskDraftsService } from './task-drafts/task-drafts.service.js';
import { TaskSuggestionsRunner } from './task-suggestions/task-suggestions.runner.js';

/**
 * The AI agent: the model client with its usage ledger and cap, the run worker, the features'
 * runners, and the API for suggestions and memory. See docs/info.md "AI agent".
 */
@Module({
  imports: [AiRunsModule, EventsModule, TasksModule],
  controllers: [AiEventController, AiOrganizationController],
  providers: [
    {
      provide: AI_MODEL_RESOLVER,
      inject: [ENV],
      useFactory: (env: Env) => createModelResolver(env),
    },
    AiClient,
    AiUsageService,
    AiRunWorker,
    AiSuggestionsRepository,
    AiSuggestionsService,
    AiMemoryService,
    TaskSuggestionsRunner,
    TaskDraftsService,
  ],
})
export class AiModule {}
