import { Body, Controller, Get, Post, Put } from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentEventAccess, OrgScoped, RequireEventAccess } from '../../authz/authz.decorators.js';
import type { EventAccess } from '../../authz/event-access.service.js';
import { CurrentOrg, type OrgContext } from '../../authz/org-context.js';
import { createTaskSchema, taskSchema, type CreateTaskInput } from '../tasks/tasks.schemas.js';
import {
  audienceSchema,
  promotionStateSchema,
  updateAudienceSchema,
  type UpdateAudienceInput,
} from './promotion.schemas.js';
import { PromotionService } from './promotion.service.js';

/**
 * The Promotie tab (docs/info.md §7.11). Everyone who can open the event reads it; Mila's side
 * only reaches managers. Managers edit the Publiek.
 */
@ApiTags('promotion')
@OrgScoped()
@Controller('events/:eventId/promotion')
export class PromotionController {
  constructor(private readonly promotion: PromotionService) {}

  @Get()
  @RequireEventAccess('read')
  @ApiResponse({ status: 200, standardSchema: promotionStateSchema })
  state(@CurrentOrg() org: OrgContext, @CurrentEventAccess() access: EventAccess) {
    return this.promotion.state(org, access);
  }

  /** The organizer's own promotion action: a task labelled Promotie. */
  @Post('tasks')
  @RequireEventAccess('manage')
  @ApiResponse({ status: 201, standardSchema: taskSchema })
  createTask(
    @CurrentOrg() org: OrgContext,
    @CurrentEventAccess() access: EventAccess,
    @Body({ schema: createTaskSchema }) body: CreateTaskInput,
  ) {
    return this.promotion.createTask(org, access, body);
  }

  @Put('audience')
  @RequireEventAccess('manage')
  @ApiResponse({ status: 200, standardSchema: audienceSchema })
  updateAudience(
    @CurrentOrg() org: OrgContext,
    @CurrentEventAccess() access: EventAccess,
    @Body({ schema: updateAudienceSchema }) body: UpdateAudienceInput,
  ) {
    return this.promotion.updateAudience(org, access, body);
  }
}
