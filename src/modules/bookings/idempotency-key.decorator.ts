import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { isUUID } from 'class-validator';
import type { Request } from 'express';
import { ValidationFailedError } from '../../common/errors/domain-errors.js';

export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';

/** Reads the required Idempotency-Key header, failing like any other invalid input. */
export const IdempotencyKey = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const key = context.switchToHttp().getRequest<Request>().get(IDEMPOTENCY_KEY_HEADER);
    if (!key || !isUUID(key)) {
      throw new ValidationFailedError([
        {
          field: IDEMPOTENCY_KEY_HEADER,
          message: `${IDEMPOTENCY_KEY_HEADER} header must be a UUID.`,
        },
      ]);
    }
    return key;
  },
);
