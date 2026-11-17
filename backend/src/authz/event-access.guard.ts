import {
  Injectable,
  NotFoundException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { z } from 'zod';
import type { EventRow } from '../db/schema/index.js';
import { REQUIRE_EVENT_ACCESS } from './authz.constants.js';
import { EventAccessService } from './event-access.service.js';
import type { OrgScopedRequest } from './org-context.js';
import type { EventAction } from './policies.js';

export interface EventScopedRequest extends OrgScopedRequest {
  event: EventRow;
}

/** Checks @RequireEventAccess() against the :eventId route param. Runs after OrgGuard. */
@Injectable()
export class EventAccessGuard implements CanActivate {
  constructor(
    private readonly eventAccess: EventAccessService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const action = this.reflector.get<EventAction | undefined>(
      REQUIRE_EVENT_ACCESS,
      context.getHandler(),
    );
    if (!action) {
      return true;
    }
    const request = context.switchToHttp().getRequest<EventScopedRequest>();
    const eventId = z.uuid().safeParse(request.params['eventId']);
    if (!eventId.success) {
      throw new NotFoundException('Event not found');
    }
    request.event = await this.eventAccess.assertCan(request.org, action, eventId.data);
    return true;
  }
}
