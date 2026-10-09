import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedRequest } from '../../common/auth/auth-user.js';
import { IS_PUBLIC_KEY } from '../../common/auth/public.decorator.js';
import { UnauthenticatedError } from '../../common/errors/domain-errors.js';
import { AuthService } from './auth.service.js';

/** Global: every route requires a valid bearer token unless it is marked @Public(). */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const [scheme, token] = request.headers.authorization?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !token) {
      throw new UnauthenticatedError('An access token is required.');
    }

    request.user = await this.auth.authenticate(token);
    return true;
  }
}
