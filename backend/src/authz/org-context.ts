import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Actor } from '../activity/actor.js';
import type { AuthenticatedRequest } from '../auth/auth.guard.js';
import type { OrgRole } from './policies.js';

/** Who is calling, inside which organization. Set by OrgGuard. Also an `ActivityScope`. */
export interface OrgContext {
  userId: string;
  organizationId: string;
  role: OrgRole;
  /** Who the activity log records as having made this request's changes. */
  actor: Actor;
}

export interface OrgScopedRequest extends AuthenticatedRequest {
  org: OrgContext;
}

export const CurrentOrg = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<OrgScopedRequest>().org,
);
