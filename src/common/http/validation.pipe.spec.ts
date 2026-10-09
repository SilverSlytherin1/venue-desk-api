import { plainToInstance } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  validateSync,
} from 'class-validator';
import { describe, expect, it } from 'vitest';
import { toFieldError } from './validation.pipe.js';

/** One property per rule the API's DTOs use, declared the way they declare it. */
class SampleDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsEmail()
  email!: string;

  @IsInt()
  @Min(1)
  @Max(4)
  seats!: number;

  @IsInt()
  @Min(1)
  page!: number;

  @IsEnum({ LOW: 'LOW', HIGH: 'HIGH' })
  priority!: string;

  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @IsISO8601({ strict: true })
  @Matches(/Z$/, { message: 'Start time must end with Z.' })
  startsAt!: string;
}

const valid = {
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  seats: 2,
  page: 1,
  priority: 'LOW',
  startsAt: '2031-05-17T19:30:00Z',
};

/** Validates the way the pipe does and returns the message reported for one field. */
function messageFor(field: string, value: unknown): string | undefined {
  const dto = plainToInstance(SampleDto, { ...valid, [field]: value });
  const errors = validateSync(dto, { whitelist: true, forbidNonWhitelisted: true });
  return errors.map(toFieldError).find((error) => error.field === field)?.message;
}

describe('toFieldError', () => {
  it.each([
    ['name', undefined, 'Name is required.'],
    ['name', '', 'Name is required.'],
    ['name', 42, 'Name must be text.'],
    ['name', 'x'.repeat(121), 'Name must be at most 120 characters.'],
    ['email', 'ada@', 'Enter a valid email address.'],
    ['seats', null, 'Number of seats is required.'],
    ['seats', 5, 'Number of seats must be between 1 and 4.'],
    ['seats', 0, 'Number of seats must be between 1 and 4.'],
    ['seats', 2.5, 'Number of seats must be a whole number.'],
    ['page', 0, 'Page must be at least 1.'],
    ['priority', 'URGENT', 'Priority must be one of: LOW, HIGH.'],
    ['assigneeId', 'sam', 'Assignee must be a valid UUID.'],
    ['startsAt', 'friday', 'Start time must be a date and time in ISO 8601 format.'],
    ['startsAt', '2031-05-17T19:30:00', 'Start time must end with Z.'],
    ['nickname', 'ada', '"nickname" is not an accepted field.'],
  ])('describes %s = %j as "%s"', (field, value, message) => {
    expect(messageFor(field, value)).toBe(message);
  });

  it('reports nothing for an optional field that is left out', () => {
    expect(messageFor('assigneeId', undefined)).toBeUndefined();
  });

  it('keeps the field name untouched: clients match errors to inputs by it', () => {
    const dto = plainToInstance(SampleDto, { ...valid, assigneeId: 'sam' });

    expect(validateSync(dto).map(toFieldError)).toEqual([
      { field: 'assigneeId', message: 'Assignee must be a valid UUID.' },
    ]);
  });
});
