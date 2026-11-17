import {
  Inject,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { fromNodeHeaders } from 'better-auth/node';
import type { Request } from 'express';
import { AUTH, type Auth, type AuthSession } from './auth.js';
import { IS_PUBLIC } from './auth.decorators.js';

export interface AuthenticatedRequest extends Request {
  user: AuthSession['user'];
  session: AuthSession['session'];
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(AUTH) private readonly auth: Auth,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const result = await this.auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!result) {
      throw new UnauthorizedException();
    }
    request.user = result.user;
    request.session = result.session;
    return true;
  }
}
