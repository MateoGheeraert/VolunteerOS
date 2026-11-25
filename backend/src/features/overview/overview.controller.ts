import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentEventAccess, OrgScoped, RequireEventAccess } from '../../authz/authz.decorators.js';
import type { EventAccess } from '../../authz/event-access.service.js';
import { CurrentOrg, type OrgContext } from '../../authz/org-context.js';
import { dismissHintSchema, overviewSchema, type DismissHintInput } from './overview.schemas.js';
import { OverviewService } from './overview.service.js';

/** The event overview (docs/info.md §7.2). Everyone who can open the event reads it. */
@ApiTags('overview')
@OrgScoped()
@Controller('events/:eventId/overview')
export class OverviewController {
  constructor(private readonly overview: OverviewService) {}

  @Get()
  @RequireEventAccess('read')
  @ApiResponse({ status: 200, standardSchema: overviewSchema })
  get(@CurrentOrg() org: OrgContext, @CurrentEventAccess() access: EventAccess) {
    return this.overview.get(org, access);
  }

  /** Puts one of Mila's hints away for the caller, until its situation changes. */
  @Post('hint-dismissals')
  @HttpCode(204)
  @RequireEventAccess('manage')
  dismissHint(
    @CurrentOrg() org: OrgContext,
    @CurrentEventAccess() access: EventAccess,
    @Body({ schema: dismissHintSchema }) body: DismissHintInput,
  ) {
    return this.overview.dismissHint(org, access, body);
  }
}
