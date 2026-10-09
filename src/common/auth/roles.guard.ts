import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from './role.js';
import { ForbiddenError } from '../errors/domain-errors.js';
import type { AuthenticatedRequest } from './auth-user.js';
import { IS_PUBLIC_KEY } from './public.decorator.js';
import { ROLES_KEY } from './roles.decorator.js';

/** Runs after JwtAuthGuard, so a non-public request always carries a user here. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, targets)) return true;

    const allowed = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, targets) ?? [];
    const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!allowed.includes(user.role)) {
      throw new ForbiddenError('Your role is not allowed to perform this action.');
    }
    return true;
  }
}
