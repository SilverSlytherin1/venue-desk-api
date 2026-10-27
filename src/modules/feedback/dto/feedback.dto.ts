import { ApiProperty, ApiSchema } from '@nestjs/swagger';
import { EventRefDto } from '../../events/dto/event-ref.dto.js';

/** What the public feedback page shows for a token. Holds nothing a link holder should not see. */
@ApiSchema({ name: 'FeedbackInvitation' })
export class FeedbackInvitationDto {
  @ApiProperty({ example: 'Autumn Jazz Night' })
  eventTitle!: string;

  @ApiProperty({ format: 'date-time' })
  eventStartsAt!: string;

  @ApiProperty({ example: 'Lena' })
  guestFirstName!: string;

  @ApiProperty({ description: 'True once the guest has rated, after which the page is read only.' })
  submitted!: boolean;

  @ApiProperty({ type: 'integer', minimum: 1, maximum: 5, nullable: true })
  rating!: number | null;
}

@ApiSchema({ name: 'SubmittedFeedback' })
export class SubmittedFeedbackDto {
  @ApiProperty({ type: 'integer', minimum: 1, maximum: 5, example: 5 })
  rating!: number;

  @ApiProperty({ type: 'string', nullable: true, example: 'Great sound, lovely evening.' })
  comment!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}

@ApiSchema({ name: 'FeedbackItem' })
export class FeedbackItemDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ type: 'integer', minimum: 1, maximum: 5, example: 5 })
  rating!: number;

  @ApiProperty({ type: 'string', nullable: true, example: 'Great sound, lovely evening.' })
  comment!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ example: 'Lena Varga' })
  guestName!: string;

  @ApiProperty({ example: 'VD-7K2Q9X' })
  bookingReference!: string;

  @ApiProperty({ type: EventRefDto })
  event!: EventRefDto;
}

@ApiSchema({ name: 'FeedbackSummary' })
export class FeedbackSummaryDto {
  @ApiProperty({
    type: 'number',
    nullable: true,
    example: 4.6,
    description: 'Mean rating to one decimal, null when there is no feedback.',
  })
  average!: number | null;

  @ApiProperty({ type: 'integer', example: 14 })
  count!: number;

  @ApiProperty({
    type: 'integer',
    isArray: true,
    minItems: 5,
    maxItems: 5,
    example: [0, 1, 1, 4, 8],
    description: 'Number of ratings of 1, 2, 3, 4 and 5, in that order.',
  })
  distribution!: number[];
}
