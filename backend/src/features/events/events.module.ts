import { Module } from '@nestjs/common';
import { AiRunsModule } from '../../ai/runs/ai-runs.module.js';
import { EventsController } from './events.controller.js';
import { EventsRepository } from './events.repository.js';
import { EventsService } from './events.service.js';

@Module({
  imports: [AiRunsModule],
  controllers: [EventsController],
  providers: [EventsService, EventsRepository],
  exports: [EventsService],
})
export class EventsModule {}
