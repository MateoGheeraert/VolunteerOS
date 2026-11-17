import { Global, Module } from '@nestjs/common';
import { EventAccessGuard } from './event-access.guard.js';
import { EventAccessService } from './event-access.service.js';
import { OrgGuard } from './org.guard.js';

@Global()
@Module({
  providers: [EventAccessService, OrgGuard, EventAccessGuard],
  exports: [EventAccessService, OrgGuard, EventAccessGuard],
})
export class AuthzModule {}
