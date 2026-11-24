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
  createLabelSchema,
  labelSchema,
  labelUsageSchema,
  updateLabelSchema,
  type CreateLabelInput,
  type UpdateLabelInput,
} from './labels.schemas.js';
import { LabelsService } from './labels.service.js';

/** A malformed id can't match anything: answer like an unknown one. */
const uuid = new ParseUUIDPipe({ errorHttpStatusCode: 404 });

/**
 * An event's labels, used by its tasks and budget entries: everyone reads them, managers
 * maintain them.
 */
@ApiTags('labels')
@OrgScoped()
@Controller('events/:eventId/labels')
export class LabelsController {
  constructor(private readonly labels: LabelsService) {}

  @Get()
  @RequireEventAccess('read')
  @ApiResponse({ status: 200, standardSchema: z.array(labelSchema) })
  list(@CurrentEventAccess() access: EventAccess) {
    return this.labels.list([access.event.id]);
  }

  @Post()
  @RequireEventAccess('manage')
  @ApiResponse({ status: 201, standardSchema: labelSchema })
  create(
    @CurrentOrg() org: OrgContext,
    @CurrentEventAccess() access: EventAccess,
    @Body({ schema: createLabelSchema }) body: CreateLabelInput,
  ) {
    return this.labels.create(org, access, body);
  }

  @Patch(':labelId')
  @RequireEventAccess('manage')
  @ApiResponse({ status: 200, standardSchema: labelSchema })
  update(
    @CurrentOrg() org: OrgContext,
    @CurrentEventAccess() access: EventAccess,
    @Param('labelId', uuid) labelId: string,
    @Body({ schema: updateLabelSchema }) body: UpdateLabelInput,
  ) {
    return this.labels.update(org, access, labelId, body);
  }

  /** How many tasks and budget entries carry the label: shown before deleting it. */
  @Get(':labelId/usage')
  @RequireEventAccess('read')
  @ApiResponse({ status: 200, standardSchema: labelUsageSchema })
  usage(@CurrentEventAccess() access: EventAccess, @Param('labelId', uuid) labelId: string) {
    return this.labels.usage(access, labelId);
  }

  @Delete(':labelId')
  @HttpCode(204)
  @RequireEventAccess('manage')
  remove(
    @CurrentOrg() org: OrgContext,
    @CurrentEventAccess() access: EventAccess,
    @Param('labelId', uuid) labelId: string,
  ) {
    return this.labels.remove(org, access, labelId);
  }
}
