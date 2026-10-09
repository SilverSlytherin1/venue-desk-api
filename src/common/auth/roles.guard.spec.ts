import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import type { Role } from './role.js';
import { ForbiddenError } from '../errors/domain-errors.js';
import { Public } from './public.decorator.js';
import { Roles } from './roles.decorator.js';
import { RolesGuard } from './roles.guard.js';

class SampleController {
  @Roles('ADMIN')
  adminOnly(): string {
    return 'for admins';
  }

  @Roles('ADMIN', 'STAFF')
  anyRole(): string {
    return 'for every signed-in user';
  }

  @Public()
  open(): string {
    return 'for everyone';
  }

  undecorated(): string {
    return 'for nobody';
  }
}

/** A context for one handler of SampleController, called by a user with the given role. */
function contextFor(handler: keyof SampleController, role?: Role): ExecutionContext {
  return {
    getHandler: () => SampleController.prototype[handler],
    getClass: () => SampleController,
    switchToHttp: () => ({ getRequest: () => ({ user: role && { id: 'user-1', role } }) }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  const guard = new RolesGuard(new Reflector());

  it('lets a listed role through', () => {
    expect(guard.canActivate(contextFor('adminOnly', 'ADMIN'))).toBe(true);
    expect(guard.canActivate(contextFor('anyRole', 'STAFF'))).toBe(true);
  });

  it('refuses a role that is not listed', () => {
    expect(() => guard.canActivate(contextFor('adminOnly', 'STAFF'))).toThrow(ForbiddenError);
  });

  it('refuses everyone on a protected route that declares no roles', () => {
    expect(() => guard.canActivate(contextFor('undecorated', 'ADMIN'))).toThrow(ForbiddenError);
    expect(() => guard.canActivate(contextFor('undecorated', 'STAFF'))).toThrow(ForbiddenError);
  });

  it('lets anonymous callers through on a public route', () => {
    expect(guard.canActivate(contextFor('open'))).toBe(true);
  });
});
