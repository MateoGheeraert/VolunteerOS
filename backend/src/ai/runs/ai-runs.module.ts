import { Module } from '@nestjs/common';
import { AiRunsService } from './ai-runs.service.js';

/**
 * Queuing AI runs. Separate from AiModule so features that trigger runs (events) can import it
 * without depending on the AI features, which themselves use those features' services.
 */
@Module({
  providers: [AiRunsService],
  exports: [AiRunsService],
})
export class AiRunsModule {}
