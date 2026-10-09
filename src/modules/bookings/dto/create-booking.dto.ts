import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsInt, IsNotEmpty, IsString, Max, MaxLength, Min } from 'class-validator';

const MAX_SEATS_PER_BOOKING = 4;

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateBookingDto {
  @ApiProperty({ example: 'Ada Lovelace', maxLength: 120 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @ApiProperty({ format: 'email', example: 'ada@example.com' })
  @Transform(trim)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ type: 'integer', minimum: 1, maximum: MAX_SEATS_PER_BOOKING, example: 2 })
  @IsInt()
  @Min(1)
  @Max(MAX_SEATS_PER_BOOKING)
  seats!: number;
}
