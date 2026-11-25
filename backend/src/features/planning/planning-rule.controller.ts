import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentEvent, OrgScoped, RequireEventAccess } from '../../authz/authz.decorators.js';
import { CurrentOrg, type OrgContext } from '../../authz/org-context.js';
import type { EventRow } from '../../db/schema/index.js';
import {
  createPlanningRuleSchema,
  planningRuleSchema,
  type CreatePlanningRuleInput,
} from './planning-rule.schemas.js';
import { PlanningRuleService } from './planning-rule.service.js';

const uuid = new ParseUUIDPipe({ errorHttpStatusCode: 404 });

/**
 * The "Regels" panel: what the organizer knows about the event's volunteers. Rules hold remarks
 * about people, so even reading them needs 'manage'.
 */
@ApiTags('planning')
@OrgScoped()
@Controller('events/:eventId/planning-rules')
export class PlanningRuleController {
  constructor(private readonly rules: PlanningRuleService) {}

  @Get()
  @RequireEventAccess('manage')
  @ApiResponse({ status: 200, standardSchema: z.array(planningRuleSchema) })
  list(@CurrentOrg() org: OrgContext, @CurrentEvent() event: EventRow) {
    return this.rules.list(org, event);
  }

  @Post()
  @HttpCode(204)
  @RequireEventAccess('manage')
  create(
    @CurrentOrg() org: OrgContext,
    @CurrentEvent() event: EventRow,
    @Body({ schema: createPlanningRuleSchema }) body: CreatePlanningRuleInput,
  ) {
    return this.rules.create(org, event, body);
  }

  @Patch(':ruleId')
  @HttpCode(204)
  @RequireEventAccess('manage')
  update(
    @CurrentOrg() org: OrgContext,
    @CurrentEvent() event: EventRow,
    @Param('ruleId', uuid) ruleId: string,
    @Body({ schema: createPlanningRuleSchema }) body: CreatePlanningRuleInput,
  ) {
    return this.rules.update(org, event, ruleId, body);
  }

  @Delete(':ruleId')
  @HttpCode(204)
  @RequireEventAccess('manage')
  remove(
    @CurrentOrg() org: OrgContext,
    @CurrentEvent() event: EventRow,
    @Param('ruleId', uuid) ruleId: string,
  ) {
    return this.rules.remove(org, event, ruleId);
  }
}
