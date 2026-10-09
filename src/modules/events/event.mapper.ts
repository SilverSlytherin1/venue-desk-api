import type { Prisma } from '../../generated/prisma/client.js';
import type { EventDto } from './dto/event.dto.js';

export const eventSelect = {
  id: true,
  title: true,
  description: true,
  venue: true,
  startsAt: true,
  capacity: true,
  seatsTaken: true,
} satisfies Prisma.EventSelect;

type EventRow = Prisma.EventGetPayload<{ select: typeof eventSelect }>;

export function toEventDto(row: EventRow): EventDto {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    venue: row.venue,
    startsAt: row.startsAt.toISOString(),
    capacity: row.capacity,
    seatsTaken: row.seatsTaken,
    seatsLeft: row.capacity - row.seatsTaken,
  };
}
