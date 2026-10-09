/** Stable machine codes of the API contract. Clients branch on these, never on messages. */
export type ErrorCode =
  | 'VALIDATION_FAILED'
  | 'INVALID_CREDENTIALS'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'EVENT_SOLD_OUT'
  | 'EVENT_CLOSED'
  | 'IDEMPOTENCY_KEY_REUSED'
  | 'INVALID_TRANSITION'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR';

export interface FieldError {
  field: string;
  message: string;
}

/**
 * What services throw. They know nothing about HTTP: ProblemFilter turns the code into a
 * status and a problem+json document.
 */
export abstract class DomainError extends Error {
  abstract readonly code: ErrorCode;

  /** Extra members of the problem document, beyond the message. */
  get extensions(): Record<string, unknown> {
    return {};
  }
}

export class ValidationFailedError extends DomainError {
  readonly code = 'VALIDATION_FAILED';

  constructor(readonly errors: FieldError[]) {
    super('The request contains invalid data.');
  }

  override get extensions(): Record<string, unknown> {
    return { errors: this.errors };
  }
}

export class InvalidCredentialsError extends DomainError {
  readonly code = 'INVALID_CREDENTIALS';

  constructor() {
    super('Email or password is incorrect.');
  }
}

export class UnauthenticatedError extends DomainError {
  readonly code = 'UNAUTHENTICATED';
}

export class ForbiddenError extends DomainError {
  readonly code = 'FORBIDDEN';
}

export class NotFoundError extends DomainError {
  readonly code = 'NOT_FOUND';

  constructor(resource: 'Event' | 'Booking' | 'Work order') {
    super(`${resource} not found.`);
  }
}

export class EventSoldOutError extends DomainError {
  readonly code = 'EVENT_SOLD_OUT';

  constructor(
    readonly seatsLeft: number,
    requested: number,
  ) {
    const left = seatsLeft === 0 ? 'No seats' : `Only ${seatsLeft} ${plural(seatsLeft, 'seat')}`;
    super(`${left} left, ${requested} requested.`);
  }

  override get extensions(): Record<string, unknown> {
    return { seatsLeft: this.seatsLeft };
  }
}

export class EventClosedError extends DomainError {
  readonly code = 'EVENT_CLOSED';

  constructor() {
    super('Booking is closed: the event has already started.');
  }
}

export class IdempotencyKeyReusedError extends DomainError {
  readonly code = 'IDEMPOTENCY_KEY_REUSED';

  constructor() {
    super('This Idempotency-Key was already used for a different booking request.');
  }
}

export class InvalidTransitionError extends DomainError {
  readonly code = 'INVALID_TRANSITION';
}

function plural(count: number, noun: string): string {
  return count === 1 ? noun : `${noun}s`;
}
