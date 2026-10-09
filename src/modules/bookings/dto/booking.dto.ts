import { ApiProperty, ApiSchema } from '@nestjs/swagger';
import { BookingStatus } from '../booking-status.js';

@ApiSchema({ name: 'Booking' })
export class BookingDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'VD-7K2Q9X', description: 'Short code a guest can quote.' })
  reference!: string;

  @ApiProperty({ format: 'uuid' })
  eventId!: string;

  @ApiProperty({ example: 'Ada Lovelace' })
  name!: string;

  @ApiProperty({ format: 'email', example: 'ada@example.com' })
  email!: string;

  @ApiProperty({ type: 'integer', minimum: 1, maximum: 4, example: 2 })
  seats!: number;

  @ApiProperty({ enum: BookingStatus, enumName: 'BookingStatus' })
  status!: BookingStatus;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}
