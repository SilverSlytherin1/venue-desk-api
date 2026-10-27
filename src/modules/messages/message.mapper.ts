import type { Prisma } from '../../generated/prisma/client.js';
import { bookingReference } from '../bookings/booking-reference.js';
import type { BookingMessageDto, MessageDto } from './dto/message.dto.js';

export const bookingMessageSelect = {
  kind: true,
  status: true,
  scheduledFor: true,
  sentAt: true,
} satisfies Prisma.MessageSelect;

type BookingMessageRow = Prisma.MessageGetPayload<{ select: typeof bookingMessageSelect }>;

export function toBookingMessageDto(row: BookingMessageRow): BookingMessageDto {
  return {
    kind: row.kind,
    status: row.status,
    scheduledFor: row.scheduledFor.toISOString(),
    sentAt: row.sentAt?.toISOString() ?? null,
  };
}

export const messageSelect = {
  id: true,
  kind: true,
  status: true,
  recipient: true,
  subject: true,
  body: true,
  scheduledFor: true,
  sentAt: true,
  booking: {
    select: { id: true, seq: true, name: true, event: { select: { id: true, title: true } } },
  },
} satisfies Prisma.MessageSelect;

type MessageRow = Prisma.MessageGetPayload<{ select: typeof messageSelect }>;

export function toMessageDto(row: MessageRow): MessageDto {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    recipient: row.recipient,
    subject: row.subject,
    body: row.body,
    scheduledFor: row.scheduledFor.toISOString(),
    sentAt: row.sentAt?.toISOString() ?? null,
    booking: { id: row.booking.id, reference: bookingReference(row.booking.seq) },
    guestName: row.booking.name,
    event: row.booking.event,
  };
}
