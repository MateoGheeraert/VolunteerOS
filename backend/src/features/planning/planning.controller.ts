import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Ip,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { Public } from '../../auth/auth.decorators.js';
import { CurrentEvent, OrgScoped, RequireEventAccess } from '../../authz/authz.decorators.js';
import { CurrentOrg, type OrgContext } from '../../authz/org-context.js';
import type { EventRow } from '../../db/schema/index.js';
import { eventSchema } from '../events/events.schemas.js';
import {
  confirmAllResultSchema,
  createApplicationSchema,
  createAssignmentSchema,
  createShiftSchema,
  createTeamSchema,
  moveAssignmentSchema,
  notifyResultSchema,
  planningSchema,
  publicEventSchema,
  publicRegistrationSchema,
  publishResultSchema,
  publishScheduleSchema,
  schedulePreviewSchema,
  shiftSchema,
  teamSchema,
  updateApplicationSchema,
  updateRegistrationSchema,
  updateShiftSchema,
  updateTeamSchema,
  type CreateApplicationInput,
  type CreateAssignmentInput,
  type CreateShiftInput,
  type CreateTeamInput,
  type MoveAssignmentInput,
  type PublicRegistrationInput,
  type PublishScheduleInput,
  type UpdateApplicationInput,
  type UpdateRegistrationInput,
  type UpdateShiftInput,
  type UpdateTeamInput,
} from './planning.schemas.js';
import { PlanningService } from './planning.service.js';
import { PublicRegistrationService } from './public-registration.service.js';
import { ScheduleService } from './schedule.service.js';
import { VolunteersService } from './volunteers.service.js';

/** A malformed id can't match anything: answer like an unknown one. */
const uuid = new ParseUUIDPipe({ errorHttpStatusCode: 404 });

/** `?confirmed=true`: the organizer confirmed removing confirmed assignments with it. */
const deleteQuery = z.object({ confirmed: z.enum(['true', 'false']).optional() });
type DeleteQuery = z.infer<typeof deleteQuery>;
const ConfirmedQuery = () =>
  ApiQuery({ name: 'confirmed', required: false, enum: ['true', 'false'] });

/**
 * An event's volunteer planning. Everyone in the organization reads the board; changing anything
 * needs 'manage' (org owners and admins, and the event's managers).
 */
@ApiTags('planning')
@OrgScoped()
@Controller('events/:eventId')
export class PlanningController {
  constructor(
    private readonly planning: PlanningService,
    private readonly volunteers: VolunteersService,
    private readonly schedule: ScheduleService,
  ) {}

  @Get('planning')
  @RequireEventAccess('read')
  @ApiResponse({ status: 200, standardSchema: planningSchema })
  board(@CurrentEvent() event: EventRow) {
    return this.planning.board(event);
  }

  @Patch('registration')
  @RequireEventAccess('manage')
  @ApiResponse({ status: 200, standardSchema: eventSchema })
  updateRegistration(
    @CurrentOrg() org: OrgContext,
    @CurrentEvent() event: EventRow,
    @Body({ schema: updateRegistrationSchema }) body: UpdateRegistrationInput,
  ) {
    return this.planning.updateRegistration(org, event, body);
  }

  // ── Teams ────────────────────────────────────────────────────────────────────────────────────

  @Post('teams')
  @RequireEventAccess('manage')
  @ApiResponse({ status: 201, standardSchema: teamSchema })
  createTeam(
    @CurrentOrg() org: OrgContext,
    @CurrentEvent() event: EventRow,
    @Body({ schema: createTeamSchema }) body: CreateTeamInput,
  ) {
    return this.planning.createTeam(org, event, body);
  }

  @Patch('teams/:teamId')
  @RequireEventAccess('manage')
  @ApiResponse({ status: 200, standardSchema: teamSchema })
  updateTeam(
    @CurrentOrg() org: OrgContext,
    @CurrentEvent() event: EventRow,
    @Param('teamId', uuid) teamId: string,
    @Body({ schema: updateTeamSchema }) body: UpdateTeamInput,
  ) {
    return this.planning.updateTeam(org, event, teamId, body);
  }

  @Delete('teams/:teamId')
  @HttpCode(204)
  @RequireEventAccess('manage')
  @ConfirmedQuery()
  removeTeam(
    @CurrentOrg() org: OrgContext,
    @CurrentEvent() event: EventRow,
    @Param('teamId', uuid) teamId: string,
    @Query({ schema: deleteQuery }) query: DeleteQuery,
  ) {
    return this.planning.removeTeam(org, event, teamId, query.confirmed === 'true');
  }

  // ── Shifts ───────────────────────────────────────────────────────────────────────────────────

  @Post('shifts')
  @RequireEventAccess('manage')
  @ApiResponse({ status: 201, standardSchema: shiftSchema })
  createShift(
    @CurrentOrg() org: OrgContext,
    @CurrentEvent() event: EventRow,
    @Body({ schema: createShiftSchema }) body: CreateShiftInput,
  ) {
    return this.planning.createShift(org, event, body);
  }

  @Patch('shifts/:shiftId')
  @RequireEventAccess('manage')
  @ApiResponse({ status: 200, standardSchema: shiftSchema })
  updateShift(
    @CurrentOrg() org: OrgContext,
    @CurrentEvent() event: EventRow,
    @Param('shiftId', uuid) shiftId: string,
    @Body({ schema: updateShiftSchema }) body: UpdateShiftInput,
  ) {
    return this.planning.updateShift(org, event, shiftId, body);
  }

  @Delete('shifts/:shiftId')
  @HttpCode(204)
  @RequireEventAccess('manage')
  @ConfirmedQuery()
  removeShift(
    @CurrentOrg() org: OrgContext,
    @CurrentEvent() event: EventRow,
    @Param('shiftId', uuid) shiftId: string,
    @Query({ schema: deleteQuery }) query: DeleteQuery,
  ) {
    return this.planning.removeShift(org, event, shiftId, query.confirmed === 'true');
  }

  // ── Applications ─────────────────────────────────────────────────────────────────────────────

  @Post('applications')
  @RequireEventAccess('manage')
  @ApiResponse({ status: 201, standardSchema: z.object({ id: z.uuid() }) })
  createApplication(
    @CurrentOrg() org: OrgContext,
    @CurrentEvent() event: EventRow,
    @Body({ schema: createApplicationSchema }) body: CreateApplicationInput,
  ) {
    return this.volunteers.createApplication(org, event, body);
  }

  @Patch('applications/:applicationId')
  @HttpCode(204)
  @RequireEventAccess('manage')
  updateApplication(
    @CurrentOrg() org: OrgContext,
    @CurrentEvent() event: EventRow,
    @Param('applicationId', uuid) applicationId: string,
    @Body({ schema: updateApplicationSchema }) body: UpdateApplicationInput,
  ) {
    return this.volunteers.updateApplication(org, event, applicationId, body);
  }

  @Delete('applications/:applicationId')
  @HttpCode(204)
  @RequireEventAccess('manage')
  @ConfirmedQuery()
  removeApplication(
    @CurrentOrg() org: OrgContext,
    @CurrentEvent() event: EventRow,
    @Param('applicationId', uuid) applicationId: string,
    @Query({ schema: deleteQuery }) query: DeleteQuery,
  ) {
    return this.volunteers.removeApplication(org, event, applicationId, query.confirmed === 'true');
  }

  // ── Assignments ──────────────────────────────────────────────────────────────────────────────

  @Post('assignments')
  @HttpCode(204)
  @RequireEventAccess('manage')
  assign(
    @CurrentOrg() org: OrgContext,
    @CurrentEvent() event: EventRow,
    @Body({ schema: createAssignmentSchema }) body: CreateAssignmentInput,
  ) {
    return this.volunteers.assign(org, event, body);
  }

  @Post('assignments/confirm-all')
  @HttpCode(200)
  @RequireEventAccess('manage')
  @ApiResponse({ status: 200, standardSchema: confirmAllResultSchema })
  confirmAll(@CurrentOrg() org: OrgContext, @CurrentEvent() event: EventRow) {
    return this.volunteers.confirmAll(org, event);
  }

  @Patch('assignments/:assignmentId')
  @HttpCode(204)
  @RequireEventAccess('manage')
  move(
    @CurrentOrg() org: OrgContext,
    @CurrentEvent() event: EventRow,
    @Param('assignmentId', uuid) assignmentId: string,
    @Body({ schema: moveAssignmentSchema }) body: MoveAssignmentInput,
  ) {
    return this.volunteers.move(org, event, assignmentId, body);
  }

  @Post('assignments/:assignmentId/confirm')
  @HttpCode(204)
  @RequireEventAccess('manage')
  confirm(
    @CurrentOrg() org: OrgContext,
    @CurrentEvent() event: EventRow,
    @Param('assignmentId', uuid) assignmentId: string,
  ) {
    return this.volunteers.confirm(org, event, assignmentId);
  }

  @Delete('assignments/:assignmentId')
  @HttpCode(204)
  @RequireEventAccess('manage')
  unassign(
    @CurrentOrg() org: OrgContext,
    @CurrentEvent() event: EventRow,
    @Param('assignmentId', uuid) assignmentId: string,
  ) {
    return this.volunteers.unassign(org, event, assignmentId);
  }

  // ── Publishing ───────────────────────────────────────────────────────────────────────────────

  @Get('schedule/preview')
  @RequireEventAccess('manage')
  @ApiResponse({ status: 200, standardSchema: schedulePreviewSchema })
  preview(@CurrentEvent() event: EventRow) {
    return this.schedule.preview(event);
  }

  @Post('schedule/publish')
  @HttpCode(200)
  @RequireEventAccess('manage')
  @ApiResponse({ status: 200, standardSchema: publishResultSchema })
  publish(
    @CurrentOrg() org: OrgContext,
    @CurrentEvent() event: EventRow,
    @Body({ schema: publishScheduleSchema }) body: PublishScheduleInput,
  ) {
    return this.schedule.publish(org, event, body);
  }

  /** After the schedule was sent: tell one volunteer about their changed shifts. */
  @Post('applications/:applicationId/notify')
  @HttpCode(200)
  @RequireEventAccess('manage')
  @ApiResponse({ status: 200, standardSchema: notifyResultSchema })
  notify(
    @CurrentOrg() org: OrgContext,
    @CurrentEvent() event: EventRow,
    @Param('applicationId', uuid) applicationId: string,
  ) {
    return this.schedule.notify(org, event, applicationId);
  }
}

/** The account-free registration page (/e/<slug> in the app). No session needed. */
@ApiTags('public')
@Public()
@Controller('public/events/:slug')
export class PublicRegistrationController {
  constructor(private readonly registration: PublicRegistrationService) {}

  @Get()
  @ApiResponse({ status: 200, standardSchema: publicEventSchema })
  get(@Param('slug') slug: string) {
    return this.registration.get(slug);
  }

  @Post('registrations')
  @HttpCode(204)
  register(
    @Param('slug') slug: string,
    @Body({ schema: publicRegistrationSchema }) body: PublicRegistrationInput,
    // The visitor's address: Next.js forwards it (x-forwarded-for) and Nest trusts its proxy.
    @Ip() ip: string,
  ) {
    return this.registration.register(slug, body, ip);
  }
}
