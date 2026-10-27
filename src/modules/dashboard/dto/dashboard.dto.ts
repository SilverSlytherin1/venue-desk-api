import { ApiProperty, ApiSchema } from '@nestjs/swagger';
import { EventDto } from '../../events/dto/event.dto.js';
import { FeedbackItemDto, FeedbackSummaryDto } from '../../feedback/dto/feedback.dto.js';

@ApiSchema({ name: 'Dashboard' })
export class DashboardDto {
  @ApiProperty({ type: [EventDto], description: 'The next five events, soonest first.' })
  upcomingEvents!: EventDto[];

  @ApiProperty({ type: 'integer', description: 'Confirmed bookings made in the last 7 days.' })
  bookingsLast7Days!: number;

  @ApiProperty({ type: 'integer', description: 'Seats of those bookings.' })
  seatsBookedLast7Days!: number;

  @ApiProperty({ type: 'integer', description: 'Messages sent in the last 30 days.' })
  messagesSentLast30Days!: number;

  @ApiProperty({ type: 'integer', description: 'Messages waiting to go out.' })
  messagesScheduled!: number;

  @ApiProperty({ type: FeedbackSummaryDto, description: 'Over all events.' })
  feedback!: FeedbackSummaryDto;

  @ApiProperty({ type: [FeedbackItemDto], description: 'The five latest ratings.' })
  recentFeedback!: FeedbackItemDto[];
}
