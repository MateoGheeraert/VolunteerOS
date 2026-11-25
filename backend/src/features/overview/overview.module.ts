import { Module } from '@nestjs/common';
import { AiModule } from '../../ai/ai.module.js';
import { OverviewController } from './overview.controller.js';
import { OverviewRepository } from './overview.repository.js';
import { OverviewService } from './overview.service.js';

@Module({
  imports: [AiModule],
  controllers: [OverviewController],
  providers: [OverviewService, OverviewRepository],
})
export class OverviewModule {}
