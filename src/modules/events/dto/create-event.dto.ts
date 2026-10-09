import { ApiProperty } from '@nestjs/swagger';
import {
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateEventDto {
  @ApiProperty({ example: 'Autumn Jazz Night', maxLength: 120 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  title!: string;

  @ApiProperty({ maxLength: 2000 })
  @IsString()
  @MaxLength(2000)
  description!: string;

  @ApiProperty({ example: 'Main Hall', maxLength: 120 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  venue!: string;

  @ApiProperty({
    format: 'date-time',
    example: '2027-03-12T20:00:00.000Z',
    description: 'In the future, and with an explicit offset: Z or for example +02:00.',
  })
  @IsISO8601({ strict: true })
  // Without an offset the same string would mean a different instant on every server.
  @Matches(/(Z|[+-]\d{2}:\d{2})$/, {
    message: 'Start time must end with Z or a UTC offset such as +02:00.',
  })
  startsAt!: string;

  @ApiProperty({ type: 'integer', minimum: 1, maximum: 100_000, example: 120 })
  @IsInt()
  @Min(1)
  @Max(100_000)
  capacity!: number;
}
