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
import {
  CurrentEventAccess,
  OrgScoped,
  RequireEventAccess,
  RequireOrgAdmin,
} from '../../authz/authz.decorators.js';
import type { EventAccess } from '../../authz/event-access.service.js';
import { CurrentOrg, type OrgContext } from '../../authz/org-context.js';
import {
  createTaskLabelSchema,
  createTaskSchema,
  myTasksSchema,
  openTaskCountSchema,
  taskLabelSchema,
  taskSchema,
  updateTaskLabelSchema,
  updateTaskSchema,
  type CreateTaskInput,
  type CreateTaskLabelInput,
  type UpdateTaskInput,
  type UpdateTaskLabelInput,
} from './tasks.schemas.js';
import { TasksService } from './tasks.service.js';

/** A malformed id can't match anything: answer like an unknown one. */
const uuid = new ParseUUIDPipe({ errorHttpStatusCode: 404 });

/**
 * An event's tasks. Reading and the member actions (status of your own task, giving it back,
 * asking for an unassigned one) need 'read'; the service applies the member rules. Everything
 * else is for managers ('manage').
 */
@ApiTags('tasks')
@OrgScoped()
@Controller('events/:eventId/tasks')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  @RequireEventAccess('read')
  @ApiResponse({ status: 200, standardSchema: z.array(taskSchema) })
  list(@CurrentOrg() org: OrgContext, @CurrentEventAccess() access: EventAccess) {
    return this.tasks.list(org, access);
  }

  @Post()
  @RequireEventAccess('manage')
  @ApiResponse({ status: 201, standardSchema: taskSchema })
  create(
    @CurrentOrg() org: OrgContext,
    @CurrentEventAccess() access: EventAccess,
    @Body({ schema: createTaskSchema }) body: CreateTaskInput,
  ) {
    return this.tasks.create(org, access, body);
  }

  @Patch(':taskId')
  @RequireEventAccess('read')
  @ApiResponse({ status: 200, standardSchema: taskSchema })
  update(
    @CurrentOrg() org: OrgContext,
    @CurrentEventAccess() access: EventAccess,
    @Param('taskId', uuid) taskId: string,
    @Body({ schema: updateTaskSchema }) body: UpdateTaskInput,
  ) {
    return this.tasks.update(org, access, taskId, body);
  }

  @Delete(':taskId')
  @HttpCode(204)
  @RequireEventAccess('manage')
  remove(
    @CurrentOrg() org: OrgContext,
    @CurrentEventAccess() access: EventAccess,
    @Param('taskId', uuid) taskId: string,
  ) {
    return this.tasks.remove(org, access, taskId);
  }

  /** Ask to be assigned an unassigned task. */
  @Post(':taskId/requests')
  @RequireEventAccess('read')
  @ApiResponse({ status: 201, standardSchema: taskSchema })
  requestAssignment(
    @CurrentOrg() org: OrgContext,
    @CurrentEventAccess() access: EventAccess,
    @Param('taskId', uuid) taskId: string,
  ) {
    return this.tasks.requestAssignment(org, access, taskId);
  }

  /** Withdraw your own open request. */
  @Delete(':taskId/requests/mine')
  @HttpCode(204)
  @RequireEventAccess('read')
  cancelRequest(
    @CurrentOrg() org: OrgContext,
    @CurrentEventAccess() access: EventAccess,
    @Param('taskId', uuid) taskId: string,
  ) {
    return this.tasks.cancelRequest(org, access, taskId);
  }

  @Post(':taskId/requests/:requestId/approve')
  @HttpCode(200)
  @RequireEventAccess('manage')
  @ApiResponse({ status: 200, standardSchema: taskSchema })
  approveRequest(
    @CurrentOrg() org: OrgContext,
    @CurrentEventAccess() access: EventAccess,
    @Param('taskId', uuid) taskId: string,
    @Param('requestId', uuid) requestId: string,
  ) {
    return this.tasks.approveRequest(org, access, taskId, requestId);
  }

  @Post(':taskId/requests/:requestId/decline')
  @HttpCode(204)
  @RequireEventAccess('manage')
  declineRequest(
    @CurrentOrg() org: OrgContext,
    @CurrentEventAccess() access: EventAccess,
    @Param('taskId', uuid) taskId: string,
    @Param('requestId', uuid) requestId: string,
  ) {
    return this.tasks.declineRequest(org, access, taskId, requestId);
  }
}

/** An event's task labels: everyone reads them, managers maintain them. */
@ApiTags('tasks')
@OrgScoped()
@Controller('events/:eventId/task-labels')
export class TaskLabelsController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  @RequireEventAccess('read')
  @ApiResponse({ status: 200, standardSchema: z.array(taskLabelSchema) })
  list(@CurrentEventAccess() access: EventAccess) {
    return this.tasks.listLabels(access);
  }

  @Post()
  @RequireEventAccess('manage')
  @ApiResponse({ status: 201, standardSchema: taskLabelSchema })
  create(
    @CurrentOrg() org: OrgContext,
    @CurrentEventAccess() access: EventAccess,
    @Body({ schema: createTaskLabelSchema }) body: CreateTaskLabelInput,
  ) {
    return this.tasks.createLabel(org, access, body);
  }

  @Patch(':labelId')
  @RequireEventAccess('manage')
  @ApiResponse({ status: 200, standardSchema: taskLabelSchema })
  update(
    @CurrentOrg() org: OrgContext,
    @CurrentEventAccess() access: EventAccess,
    @Param('labelId', uuid) labelId: string,
    @Body({ schema: updateTaskLabelSchema }) body: UpdateTaskLabelInput,
  ) {
    return this.tasks.updateLabel(org, access, labelId, body);
  }

  @Delete(':labelId')
  @HttpCode(204)
  @RequireEventAccess('manage')
  remove(
    @CurrentOrg() org: OrgContext,
    @CurrentEventAccess() access: EventAccess,
    @Param('labelId', uuid) labelId: string,
  ) {
    return this.tasks.removeLabel(org, access, labelId);
  }
}

/** The caller's tasks across events. */
@ApiTags('tasks')
@OrgScoped()
@Controller('tasks')
export class MyTasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get('mine')
  @ApiResponse({ status: 200, standardSchema: myTasksSchema })
  listMine(@CurrentOrg() org: OrgContext) {
    return this.tasks.listMine(org);
  }
}

/** Organization-level views of members' tasks. */
@ApiTags('tasks')
@OrgScoped()
@Controller('members')
export class MemberTasksController {
  constructor(private readonly tasks: TasksService) {}

  /** The member's unfinished tasks per event: shown before removing them from the organization. */
  @Get(':userId/open-tasks')
  @RequireOrgAdmin()
  @ApiResponse({ status: 200, standardSchema: z.array(openTaskCountSchema) })
  openTasks(@CurrentOrg() org: OrgContext, @Param('userId') userId: string) {
    return this.tasks.openTaskCounts(org, userId);
  }
}
