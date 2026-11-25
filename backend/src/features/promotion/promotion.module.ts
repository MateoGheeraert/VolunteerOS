import { Module } from '@nestjs/common';
import { AiModule } from '../../ai/ai.module.js';
import { TasksModule } from '../tasks/tasks.module.js';
import { PromotionController } from './promotion.controller.js';
import { PromotionRepository } from './promotion.repository.js';
import { PromotionService } from './promotion.service.js';

/** The Promotie tab. Mila's plan itself (runs, accepting) is in the AI module. */
@Module({
  imports: [AiModule, TasksModule],
  controllers: [PromotionController],
  providers: [PromotionService, PromotionRepository],
})
export class PromotionModule {}
