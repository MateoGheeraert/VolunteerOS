import {
  applyDecorators,
  createParamDecorator,
  SetMetadata,
  UseGuards,
  type ExecutionContext,
} from '@nestjs/common';
import { REQUIRE_EVENT_ACCESS, REQUIRE_ORG_ADMIN } from './authz.constants.js';
import { EventAccessGuard, type EventScopedRequest } from './event-access.guard.js';
import { OrgGuard } from './org.guard.js';
import type { EventAction } from './policies.js';

/** The controller's routes run inside the caller's active organization (see OrgGuard). */
export const OrgScoped = () => UseGuards(OrgGuard);

/** Only organization owners and admins. Use on an @OrgScoped() controller. */
export const RequireOrgAdmin = () => SetMetadata(REQUIRE_ORG_ADMIN, true);

/**
 * Checks the :eventId route param against the event policy, and loads the event.
 * Use on an @OrgScoped() controller: controller guards run before method guards.
 */
export const RequireEventAccess = (action: EventAction) =>
  applyDecorators(SetMetadata(REQUIRE_EVENT_ACCESS, action), UseGuards(EventAccessGuard));

/** The event that @RequireEventAccess() loaded and authorized. */
export const CurrentEvent = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) =>
    ctx.switchToHttp().getRequest<EventScopedRequest>().event,
);
