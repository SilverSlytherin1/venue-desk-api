import { ApiProperty, ApiSchema } from '@nestjs/swagger';

@ApiSchema({ name: 'Event' })
export class EventDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Autumn Jazz Night' })
  title!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty({ example: 'Main Hall' })
  venue!: string;

  @ApiProperty({ format: 'date-time' })
  startsAt!: string;

  @ApiProperty({ type: 'integer', example: 120 })
  capacity!: number;

  @ApiProperty({ type: 'integer', example: 118 })
  seatsTaken!: number;

  @ApiProperty({ type: 'integer', example: 2, description: 'capacity minus seatsTaken' })
  seatsLeft!: number;
}
