import { SetMetadata } from '@nestjs/common';
import type { Role } from './role.js';

export const ROLES_KEY = 'auth:roles';

/**
 * Lists the roles allowed to call a route. A protected route without this decorator is
 * denied to everyone, so forgetting it fails closed.
 */
export const Roles = (...roles: Role[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);
