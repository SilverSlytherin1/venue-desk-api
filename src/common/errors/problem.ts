import { HttpException } from '@nestjs/common';
import { DomainError, type ErrorCode } from './domain-errors.js';

export const PROBLEM_TYPES: Record<ErrorCode, { status: number; title: string }> = {
  VALIDATION_FAILED: { status: 400, title: 'Validation failed' },
  INVALID_CREDENTIALS: { status: 401, title: 'Invalid credentials' },
  UNAUTHENTICATED: { status: 401, title: 'Authentication required' },
  FORBIDDEN: { status: 403, title: 'Forbidden' },
  NOT_FOUND: { status: 404, title: 'Not found' },
  EVENT_SOLD_OUT: { status: 409, title: 'Event sold out' },
  EVENT_CLOSED: { status: 409, title: 'Event closed' },
  IDEMPOTENCY_KEY_REUSED: { status: 409, title: 'Idempotency key reused' },
  INVALID_TRANSITION: { status: 409, title: 'Invalid transition' },
  RATE_LIMITED: { status: 429, title: 'Too many requests' },
  INTERNAL_ERROR: { status: 500, title: 'Internal server error' },
};

/** Errors raised by the framework itself: unknown route, throttling, unreadable body. */
const FRAMEWORK_CODES: Partial<Record<number, ErrorCode>> = {
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  429: 'RATE_LIMITED',
};

/** RFC 7807 problem document, extended with the contract's stable `code`. */
export interface Problem {
  type: string;
  title: string;
  status: number;
  code: ErrorCode;
  detail: string;
  instance: string;
  [extension: string]: unknown;
}

export function toProblem(exception: unknown, instance: string): Problem {
  const { code, detail, extensions } = classify(exception);
  const { status, title } = PROBLEM_TYPES[code];

  return {
    type: `https://venue-desk.dev/problems/${code.toLowerCase().replaceAll('_', '-')}`,
    title,
    status,
    code,
    detail,
    instance,
    ...extensions,
  };
}

function classify(exception: unknown): {
  code: ErrorCode;
  detail: string;
  extensions?: Record<string, unknown>;
} {
  if (exception instanceof DomainError) {
    return { code: exception.code, detail: exception.message, extensions: exception.extensions };
  }

  if (exception instanceof HttpException && exception.getStatus() < 500) {
    const code = FRAMEWORK_CODES[exception.getStatus()];
    // Any other client error (malformed JSON, oversized body) is a request we could not read:
    // clients only ever see codes that are in the contract.
    return code
      ? { code, detail: exception.message }
      : { code: 'VALIDATION_FAILED', detail: exception.message, extensions: { errors: [] } };
  }

  // The real cause goes to the log, never to the client.
  return { code: 'INTERNAL_ERROR', detail: 'An unexpected error occurred.' };
}
