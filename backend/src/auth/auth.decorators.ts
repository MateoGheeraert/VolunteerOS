import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import type { AuthenticatedRequest } from './auth.guard.js';

export const IS_PUBLIC = Symbol('IS_PUBLIC');

/** Opts a route out of the global AuthGuard. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** The signed-in user, as set by AuthGuard. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) =>
    ctx.switchToHttp().getRequest<AuthenticatedRequest>().user,
);
