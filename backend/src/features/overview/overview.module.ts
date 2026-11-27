import { Module } from '@nestjs/common';
import { AiModule } from '../../ai/ai.module.js';
import { PromotionRepository } from '../promotion/promotion.repository.js';
import { OverviewController } from './overview.controller.js';
import { OverviewRepository } from './overview.repository.js';
import { OverviewService } from './overview.service.js';

@Module({
  imports: [AiModule],
  controllers: [OverviewController],
  providers: [OverviewService, OverviewRepository, PromotionRepository],
})
export class OverviewModule {}
