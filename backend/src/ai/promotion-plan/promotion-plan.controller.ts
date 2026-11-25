import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentEventAccess, OrgScoped, RequireEventAccess } from '../../authz/authz.decorators.js';
import type { EventAccess } from '../../authz/event-access.service.js';
import { CurrentOrg, type OrgContext } from '../../authz/org-context.js';
import { aiRunSchema } from '../ai.schemas.js';
import {
  acceptPromoActionsSchema,
  requestPromotionPlanSchema,
  type AcceptPromoActionsInput,
  type RequestPromotionPlanInput,
} from './promotion-plan.schemas.js';
import { PromotionPlanService } from './promotion-plan.service.js';

/**
 * Mila's promotion plan on one event (docs/info.md §7.11). Rejecting an action and marking cards
 * seen go through the generic suggestion routes. Changes the event: 'manage'.
 */
@ApiTags('ai')
@OrgScoped()
@Controller('events/:eventId/ai/promotion-plan')
export class PromotionPlanController {
  constructor(private readonly plans: PromotionPlanService) {}

  /** Queues a plan run; the result arrives on the AI stream. 409 when the guards say no. */
  @Post()
  @HttpCode(202)
  @RequireEventAccess('manage')
  @ApiResponse({ status: 202, standardSchema: aiRunSchema })
  request(
    @CurrentOrg() org: OrgContext,
    @CurrentEventAccess() access: EventAccess,
    @Body({ schema: requestPromotionPlanSchema }) body: RequestPromotionPlanInput,
  ) {
    return this.plans.request(org, access, body);
  }

  @Post('accept')
  @HttpCode(204)
  @RequireEventAccess('manage')
  accept(
    @CurrentOrg() org: OrgContext,
    @CurrentEventAccess() access: EventAccess,
    @Body({ schema: acceptPromoActionsSchema }) body: AcceptPromoActionsInput,
  ) {
    return this.plans.accept(org, access, body);
  }
}
