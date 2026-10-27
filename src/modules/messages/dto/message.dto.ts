import { ApiProperty, ApiSchema } from '@nestjs/swagger';
import { EventRefDto } from '../../events/dto/event-ref.dto.js';
import { MessageKind, MessageStatus } from '../message.enums.js';

/** A message as the guest's booking shows it: what goes out when, without the text. */
@ApiSchema({ name: 'BookingMessage' })
export class BookingMessageDto {
  @ApiProperty({ enum: MessageKind, enumName: 'MessageKind' })
  kind!: MessageKind;

  @ApiProperty({ enum: MessageStatus, enumName: 'MessageStatus' })
  status!: MessageStatus;

  @ApiProperty({ format: 'date-time' })
  scheduledFor!: string;

  @ApiProperty({ type: 'string', format: 'date-time', nullable: true })
  sentAt!: string | null;
}

@ApiSchema({ name: 'BookingRef' })
export class BookingRefDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'VD-7K2Q9X' })
  reference!: string;
}

/** A message as the staff see it: the exact text, and where it belongs. */
@ApiSchema({ name: 'Message' })
export class MessageDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: MessageKind, enumName: 'MessageKind' })
  kind!: MessageKind;

  @ApiProperty({ enum: MessageStatus, enumName: 'MessageStatus' })
  status!: MessageStatus;

  @ApiProperty({ format: 'email', example: 'lena@example.com' })
  recipient!: string;

  @ApiProperty({ example: 'Your seats for Autumn Jazz Night' })
  subject!: string;

  @ApiProperty({ description: 'Plain text, lines separated by \\n.' })
  body!: string;

  @ApiProperty({ format: 'date-time' })
  scheduledFor!: string;

  @ApiProperty({ type: 'string', format: 'date-time', nullable: true })
  sentAt!: string | null;

  @ApiProperty({ type: BookingRefDto })
  booking!: BookingRefDto;

  @ApiProperty({ example: 'Lena Varga' })
  guestName!: string;

  @ApiProperty({ type: EventRefDto })
  event!: EventRefDto;
}
