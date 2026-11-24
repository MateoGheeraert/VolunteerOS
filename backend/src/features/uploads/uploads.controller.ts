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
  Query,
} from '@nestjs/common';
import { ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentEventAccess, OrgScoped, RequireEventAccess } from '../../authz/authz.decorators.js';
import type { EventAccess } from '../../authz/event-access.service.js';
import { CurrentOrg, type OrgContext } from '../../authz/org-context.js';
import {
  createUploadSchema,
  downloadUrlSchema,
  pendingUploadSchema,
  renameUploadSchema,
  uploadListSchema,
  uploadSchema,
  type CreateUploadInput,
  type RenameUploadInput,
} from './uploads.schemas.js';
import { UploadsService } from './uploads.service.js';

/** A malformed id can't match anything: answer like an unknown one. */
const uuid = new ParseUUIDPipe({ errorHttpStatusCode: 404 });
const optionalUuid = new ParseUUIDPipe({ errorHttpStatusCode: 404, optional: true });

/**
 * Files of an event, its tasks and its budget entries. Every route needs 'read'; the service decides who may add,
 * rename and delete (managers, and members on their own task).
 *
 * Uploading: POST announces the file and returns a signed URL, the browser PUTs the file there,
 * then POST .../confirm lists it.
 */
@ApiTags('uploads')
@OrgScoped()
@Controller('events/:eventId/uploads')
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  /**
   * The event's files and those of its tasks and budget entries the caller sees; `taskId` or
   * `budgetEntryId` narrows to one of them.
   */
  @Get()
  @RequireEventAccess('read')
  @ApiQuery({ name: 'taskId', required: false, type: String })
  @ApiQuery({ name: 'budgetEntryId', required: false, type: String })
  @ApiResponse({ status: 200, standardSchema: uploadListSchema })
  list(
    @CurrentOrg() org: OrgContext,
    @CurrentEventAccess() access: EventAccess,
    @Query('taskId', optionalUuid) taskId?: string,
    @Query('budgetEntryId', optionalUuid) budgetEntryId?: string,
  ) {
    return this.uploads.list(org, access, { taskId, budgetEntryId });
  }

  @Post()
  @RequireEventAccess('read')
  @ApiResponse({ status: 201, standardSchema: pendingUploadSchema })
  create(
    @CurrentOrg() org: OrgContext,
    @CurrentEventAccess() access: EventAccess,
    @Body({ schema: createUploadSchema }) body: CreateUploadInput,
  ) {
    return this.uploads.create(org, access, body);
  }

  @Post(':uploadId/confirm')
  @HttpCode(200)
  @RequireEventAccess('read')
  @ApiResponse({ status: 200, standardSchema: uploadSchema })
  confirm(
    @CurrentOrg() org: OrgContext,
    @CurrentEventAccess() access: EventAccess,
    @Param('uploadId', uuid) uploadId: string,
  ) {
    return this.uploads.confirm(org, access, uploadId);
  }

  @Patch(':uploadId')
  @RequireEventAccess('read')
  @ApiResponse({ status: 200, standardSchema: uploadSchema })
  rename(
    @CurrentOrg() org: OrgContext,
    @CurrentEventAccess() access: EventAccess,
    @Param('uploadId', uuid) uploadId: string,
    @Body({ schema: renameUploadSchema }) body: RenameUploadInput,
  ) {
    return this.uploads.rename(org, access, uploadId, body);
  }

  @Delete(':uploadId')
  @HttpCode(204)
  @RequireEventAccess('read')
  remove(
    @CurrentOrg() org: OrgContext,
    @CurrentEventAccess() access: EventAccess,
    @Param('uploadId', uuid) uploadId: string,
  ) {
    return this.uploads.remove(org, access, uploadId);
  }

  /** A short-lived link to the file. Minted per click: lists never carry one. */
  @Get(':uploadId/download')
  @RequireEventAccess('read')
  @ApiResponse({ status: 200, standardSchema: downloadUrlSchema })
  download(
    @CurrentOrg() org: OrgContext,
    @CurrentEventAccess() access: EventAccess,
    @Param('uploadId', uuid) uploadId: string,
  ) {
    return this.uploads.downloadUrl(org, access, uploadId);
  }
}
