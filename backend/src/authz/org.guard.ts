import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, eq } from 'drizzle-orm';
import type { Database } from '../db/database.js';
import { member } from '../db/schema/index.js';
import type { OrgScopedRequest } from './org-context.js';
import { isOrgAdmin, toOrgRole } from './policies.js';
import { REQUIRE_ORG_ADMIN } from './authz.constants.js';

/**
 * Resolves the caller's active organization (from the Better Auth session) and their role in it.
 * Runs after the global AuthGuard, so request.user is set.
 */
@Injectable()
export class OrgGuard implements CanActivate {
  constructor(
    @InjectDrizzle() private readonly db: Database,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<OrgScopedRequest>();
    const organizationId = request.session.activeOrganizationId;
    if (!organizationId) {
      throw new ForbiddenException('Select an organization first');
    }

    const [membership] = await this.db
      .select({ role: member.role })
      .from(member)
      .where(and(eq(member.organizationId, organizationId), eq(member.userId, request.user.id)))
      .limit(1);
    if (!membership) {
      throw new ForbiddenException('Not a member of the active organization');
    }

    request.org = {
      userId: request.user.id,
      organizationId,
      role: toOrgRole(membership.role),
    };

    const requiresAdmin = this.reflector.getAllAndOverride<boolean>(REQUIRE_ORG_ADMIN, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (requiresAdmin && !isOrgAdmin(request.org.role)) {
      throw new ForbiddenException();
    }
    return true;
  }
}
