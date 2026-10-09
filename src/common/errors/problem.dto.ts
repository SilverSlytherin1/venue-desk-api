import { applyDecorators } from '@nestjs/common';
import {
  ApiExtraModels,
  ApiProperty,
  ApiPropertyOptional,
  ApiResponse,
  ApiSchema,
  getSchemaPath,
} from '@nestjs/swagger';
import type { ErrorCode } from './domain-errors.js';
import { PROBLEM_TYPES } from './problem.js';

@ApiSchema({ name: 'FieldError' })
class FieldErrorDto {
  @ApiProperty({ example: 'seats' })
  field!: string;

  @ApiProperty({ example: 'Number of seats must be between 1 and 4.' })
  message!: string;
}

@ApiSchema({ name: 'Problem', description: 'RFC 7807 problem document.' })
export class ProblemDto {
  @ApiProperty({ example: 'https://venue-desk.dev/problems/event-sold-out' })
  type!: string;

  @ApiProperty({ example: 'Event sold out' })
  title!: string;

  @ApiProperty({ type: 'integer', example: 409 })
  status!: number;

  @ApiProperty({ enum: Object.keys(PROBLEM_TYPES), description: 'Stable machine code.' })
  code!: ErrorCode;

  @ApiProperty({ example: 'Only 1 seat left, 3 requested.' })
  detail!: string;

  @ApiProperty({ example: '/api/v1/events/3f0c6f0e-6f0b-4d3b-9d39-0d3b5f6f2a11/bookings' })
  instance!: string;

  @ApiPropertyOptional({ type: [FieldErrorDto], description: 'Only with VALIDATION_FAILED.' })
  errors?: FieldErrorDto[];

  @ApiPropertyOptional({ type: 'integer', description: 'Only with EVENT_SOLD_OUT.' })
  seatsLeft?: number;
}

/** Documents the problem responses a route can return, grouped by HTTP status. */
export function ApiProblem(...codes: ErrorCode[]): MethodDecorator & ClassDecorator {
  const codesByStatus = Map.groupBy(codes, (code) => PROBLEM_TYPES[code].status);

  return applyDecorators(
    ApiExtraModels(ProblemDto),
    ...[...codesByStatus].map(([status, statusCodes]) =>
      ApiResponse({
        status,
        description: statusCodes.join(', '),
        content: { 'application/problem+json': { schema: { $ref: getSchemaPath(ProblemDto) } } },
      }),
    ),
  );
}
