import type { Prisma } from '../../generated/prisma/client.js';
import { bookingReference } from './booking-reference.js';
import type { BookingDto } from './dto/booking.dto.js';

export const bookingSelect = {
  id: true,
  seq: true,
  eventId: true,
  name: true,
  email: true,
  seats: true,
  status: true,
  createdAt: true,
} satisfies Prisma.BookingSelect;

type BookingRow = Prisma.BookingGetPayload<{ select: typeof bookingSelect }>;

export function toBookingDto(row: BookingRow): BookingDto {
  return {
    id: row.id,
    reference: bookingReference(row.seq),
    eventId: row.eventId,
    name: row.name,
    email: row.email,
    seats: row.seats,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}
