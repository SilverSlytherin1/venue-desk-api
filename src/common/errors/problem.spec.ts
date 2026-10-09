import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  InternalServerErrorException,
  NotFoundException,
  PayloadTooLargeException,
  UnauthorizedException,
} from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { EventSoldOutError, NotFoundError, ValidationFailedError } from './domain-errors.js';
import { toProblem } from './problem.js';

const INSTANCE = '/api/v1/events/123/bookings';

describe('toProblem', () => {
  it('maps a domain error to its status, title and type URL', () => {
    expect(toProblem(new NotFoundError('Event'), INSTANCE)).toEqual({
      type: 'https://venue-desk.dev/problems/not-found',
      title: 'Not found',
      status: 404,
      code: 'NOT_FOUND',
      detail: 'Event not found.',
      instance: INSTANCE,
    });
  });

  it('carries seatsLeft for a sold out event', () => {
    expect(toProblem(new EventSoldOutError(1, 3), INSTANCE)).toMatchObject({
      status: 409,
      code: 'EVENT_SOLD_OUT',
      detail: 'Only 1 seat left, 3 requested.',
      seatsLeft: 1,
    });
    expect(toProblem(new EventSoldOutError(0, 2), INSTANCE)).toMatchObject({
      detail: 'No seats left, 2 requested.',
      seatsLeft: 0,
    });
  });

  it('carries field errors for a validation failure, and only then', () => {
    const errors = [{ field: 'seats', message: 'Number of seats must be between 1 and 4.' }];

    expect(toProblem(new ValidationFailedError(errors), INSTANCE)).toMatchObject({
      status: 400,
      code: 'VALIDATION_FAILED',
      errors,
    });
    expect(toProblem(new NotFoundError('Event'), INSTANCE)).not.toHaveProperty('errors');
  });

  it.each([
    [new UnauthorizedException(), 401, 'UNAUTHENTICATED'],
    [new ForbiddenException(), 403, 'FORBIDDEN'],
    [new NotFoundException('Cannot GET /nope'), 404, 'NOT_FOUND'],
    [new HttpException('Too many attempts', 429), 429, 'RATE_LIMITED'],
    [new BadRequestException('Unexpected end of JSON input'), 400, 'VALIDATION_FAILED'],
    [new PayloadTooLargeException('request entity too large'), 400, 'VALIDATION_FAILED'],
  ])('maps the framework error "%s" to %i %s', (exception, status, code) => {
    expect(toProblem(exception, INSTANCE)).toMatchObject({
      status,
      code,
      detail: exception.message,
    });
  });

  it('hides the cause of an unexpected error', () => {
    const causes = [
      new Error('connect ECONNREFUSED 10.0.0.5:5432'),
      new InternalServerErrorException('SELECT * FROM users failed'),
      'a thrown string',
    ];

    for (const cause of causes) {
      expect(toProblem(cause, INSTANCE)).toEqual({
        type: 'https://venue-desk.dev/problems/internal-error',
        title: 'Internal server error',
        status: 500,
        code: 'INTERNAL_ERROR',
        detail: 'An unexpected error occurred.',
        instance: INSTANCE,
      });
    }
  });
});
