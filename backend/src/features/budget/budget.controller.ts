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
import { CurrentEventAccess, OrgScoped, RequireEventAccess } from '../../authz/authz.decorators.js';
import type { EventAccess } from '../../authz/event-access.service.js';
import { CurrentOrg, type OrgContext } from '../../authz/org-context.js';
import {
  budgetEntrySchema,
  createBudgetEntrySchema,
  updateBudgetEntrySchema,
  type CreateBudgetEntryInput,
  type UpdateBudgetEntryInput,
} from './budget.schemas.js';
import { BudgetService } from './budget.service.js';

/** A malformed id can't match anything: answer like an unknown one. */
const uuid = new ParseUUIDPipe({ errorHttpStatusCode: 404 });

/** An event's budget entries: every member reads them, managers maintain them. */
@ApiTags('budget')
@OrgScoped()
@Controller('events/:eventId/budget-entries')
export class BudgetController {
  constructor(private readonly budget: BudgetService) {}

  @Get()
  @RequireEventAccess('read')
  @ApiResponse({ status: 200, standardSchema: z.array(budgetEntrySchema) })
  list(@CurrentOrg() org: OrgContext, @CurrentEventAccess() access: EventAccess) {
    return this.budget.list(org, access);
  }

  @Post()
  @RequireEventAccess('manage')
  @ApiResponse({ status: 201, standardSchema: budgetEntrySchema })
  create(
    @CurrentOrg() org: OrgContext,
    @CurrentEventAccess() access: EventAccess,
    @Body({ schema: createBudgetEntrySchema }) body: CreateBudgetEntryInput,
  ) {
    return this.budget.create(org, access, body);
  }

  @Patch(':entryId')
  @RequireEventAccess('manage')
  @ApiResponse({ status: 200, standardSchema: budgetEntrySchema })
  update(
    @CurrentOrg() org: OrgContext,
    @CurrentEventAccess() access: EventAccess,
    @Param('entryId', uuid) entryId: string,
    @Body({ schema: updateBudgetEntrySchema }) body: UpdateBudgetEntryInput,
  ) {
    return this.budget.update(org, access, entryId, body);
  }

  @Delete(':entryId')
  @HttpCode(204)
  @RequireEventAccess('manage')
  remove(
    @CurrentOrg() org: OrgContext,
    @CurrentEventAccess() access: EventAccess,
    @Param('entryId', uuid) entryId: string,
  ) {
    return this.budget.remove(org, access, entryId);
  }
}
