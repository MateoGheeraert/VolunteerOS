import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  addEventMemberSchema,
  createEventSchema,
  eventDetailSchema,
  eventMemberSchema,
  eventSchema,
  updateEventSchema,
  type AddEventMemberInput,
  type CreateEventInput,
  type UpdateEventInput,
} from './events.schemas.js';
import { z } from 'zod';
import { CurrentEvent, OrgScoped, RequireEventAccess } from '../../authz/authz.decorators.js';
import { CurrentOrg, type OrgContext } from '../../authz/org-context.js';
import type { EventRow } from '../../db/schema/index.js';
import { EventsService } from './events.service.js';

@ApiTags('events')
@OrgScoped()
@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Get()
  @ApiResponse({ status: 200, standardSchema: z.array(eventSchema) })
  list(@CurrentOrg() org: OrgContext) {
    return this.events.list(org);
  }

  /** Any organizer can create an event, and becomes its manager (Journey A). */
  @Post()
  @ApiResponse({ status: 201, standardSchema: eventSchema })
  create(
    @CurrentOrg() org: OrgContext,
    @Body({ schema: createEventSchema }) body: CreateEventInput,
  ) {
    return this.events.create(org, body);
  }

  @Get(':eventId')
  @RequireEventAccess('read')
  @ApiResponse({ status: 200, standardSchema: eventDetailSchema })
  get(@CurrentOrg() org: OrgContext, @CurrentEvent() event: EventRow) {
    return this.events.get(org, event);
  }

  @Patch(':eventId')
  @RequireEventAccess('manage')
  @ApiResponse({ status: 200, standardSchema: eventSchema })
  update(
    @CurrentOrg() org: OrgContext,
    @CurrentEvent() event: EventRow,
    @Body({ schema: updateEventSchema }) body: UpdateEventInput,
  ) {
    return this.events.update(org, event, body);
  }

  @Post(':eventId/archive')
  @HttpCode(200)
  @RequireEventAccess('manage')
  @ApiResponse({ status: 200, standardSchema: eventSchema })
  archive(@CurrentOrg() org: OrgContext, @CurrentEvent() event: EventRow) {
    return this.events.archive(org, event);
  }

  @Get(':eventId/members')
  @RequireEventAccess('read')
  @ApiResponse({ status: 200, standardSchema: z.array(eventMemberSchema) })
  listMembers(@CurrentOrg() org: OrgContext, @CurrentEvent() event: EventRow) {
    return this.events.listMembers(org, event.id);
  }

  @Post(':eventId/members')
  @HttpCode(204)
  @RequireEventAccess('manageMembers')
  addMember(
    @CurrentOrg() org: OrgContext,
    @CurrentEvent() event: EventRow,
    @Body({ schema: addEventMemberSchema }) body: AddEventMemberInput,
  ) {
    return this.events.addMember(org, event.id, body);
  }

  @Delete(':eventId/members/:userId')
  @HttpCode(204)
  @RequireEventAccess('manageMembers')
  removeMember(
    @CurrentOrg() org: OrgContext,
    @CurrentEvent() event: EventRow,
    @Param('userId') userId: string,
  ) {
    return this.events.removeMember(org, event.id, userId);
  }
}
