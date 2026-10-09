import type { Request } from 'express';
import type { Role } from './role.js';

/** The authenticated caller, as loaded from the database for this request. */
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

/** A request that got past the authentication guard on a route that is not @Public(). */
export type AuthenticatedRequest = Request & { user: AuthUser };
