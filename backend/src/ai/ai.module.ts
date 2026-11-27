import { Module } from '@nestjs/common';
import { ENV, type Env } from '../config/env.js';
import { BudgetModule } from '../features/budget/budget.module.js';
import { EventsModule } from '../features/events/events.module.js';
import { PromotionRepository } from '../features/promotion/promotion.repository.js';
import { PlanningModule } from '../features/planning/planning.module.js';
import { TasksModule } from '../features/tasks/tasks.module.js';
import { AiClient } from './ai-client.service.js';
import { AI_MODEL_RESOLVER, createModelResolver } from './ai-models.js';
import { AiUsageService } from './ai-usage.service.js';
import { BudgetReviewRunner } from './budget-review/budget-review.runner.js';
import { AiEventController, AiOrganizationController } from './ai.controller.js';
import { PromotionPlanController } from './promotion-plan/promotion-plan.controller.js';
import { PromotionPlanRunner } from './promotion-plan/promotion-plan.runner.js';
import { PromotionPlanService } from './promotion-plan/promotion-plan.service.js';
import { AllocationInputs } from './allocation/allocation-inputs.service.js';
import { AllocationRunner } from './allocation/allocation.runner.js';
import { PlanningAiController } from './planning/planning-ai.controller.js';
import { PlanningSuggestionsService } from './planning/planning-suggestions.service.js';
import { RuleDraftsService } from './rule-drafts/rule-drafts.service.js';
import { ShiftSuggestionsRunner } from './shift-suggestions/shift-suggestions.runner.js';
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
  imports: [AiRunsModule, EventsModule, TasksModule, BudgetModule, PlanningModule],
  controllers: [
    AiEventController,
    AiOrganizationController,
    PromotionPlanController,
    PlanningAiController,
  ],
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
    BudgetReviewRunner,
    TaskDraftsService,
    PromotionRepository,
    PromotionPlanRunner,
    PromotionPlanService,
    ShiftSuggestionsRunner,
    AllocationRunner,
    AllocationInputs,
    RuleDraftsService,
    PlanningSuggestionsService,
  ],
  // The overview asks whether Mila is available.
  exports: [AI_MODEL_RESOLVER],
})
export class AiModule {}
