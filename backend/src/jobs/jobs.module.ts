import { Global, Module } from '@nestjs/common';
import { JobsService } from './jobs.service.js';
import { LiveUpdatesService } from './live-updates.service.js';

/** Background jobs and live updates to open browser pages. Global: any service may use them. */
@Global()
@Module({
  providers: [JobsService, LiveUpdatesService],
  exports: [JobsService, LiveUpdatesService],
})
export class JobsModule {}
