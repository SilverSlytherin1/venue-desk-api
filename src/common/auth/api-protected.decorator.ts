import { applyDecorators } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { ApiProblem } from '../errors/problem.dto.js';

/** OpenAPI counterpart of a protected route: a bearer token is required, 401 and 403 can come back. */
export const ApiProtected = (): MethodDecorator & ClassDecorator =>
  applyDecorators(ApiBearerAuth(), ApiProblem('UNAUTHENTICATED', 'FORBIDDEN'));
