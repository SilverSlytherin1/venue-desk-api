import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import {
  EventClosedError,
  EventSoldOutError,
  IdempotencyKeyReusedError,
  NotFoundError,
} from '../../common/errors/domain-errors.js';
import { type Page, type PageQueryDto, toSkipTake } from '../../common/http/pagination.js';
import { violatedForeignKey } from '../../database/prisma-errors.js';
import { PrismaService } from '../../database/prisma.service.js';
import { EventsService } from '../events/events.service.js';
import { MessagesService } from '../messages/messages.service.js';
import { bookingSelect, toBookingDto } from './booking.mapper.js';
import type { BookingDto } from './dto/booking.dto.js';
import type { CreateBookingDto } from './dto/create-booking.dto.js';

export interface BookingResult {
  booking: BookingDto;
  /** True when the booking already existed and this request was a retry of the one that made it. */
  replayed: boolean;
}

/** What the seat update returns: what the guest's messages say about the event. */
interface ClaimedEvent {
  title: string;
  venue: string;
  startsAt: Date;
}

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
    private readonly messages: MessagesService,
  ) {}

  /**
   * One transaction: take the idempotency key, take the seats, write the guest's messages,
   * commit. A request that cannot take the key is a retry. A request that cannot take the
   * seats throws, which rolls back its own booking row. docs/adr/0001 explains why this shape.
   * After the commit the confirmation goes out at once.
   */
  async book(
    eventId: string,
    idempotencyKey: string,
    dto: CreateBookingDto,
  ): Promise<BookingResult> {
    const payloadHash = hashPayload(eventId, dto);

    const result = await this.prisma.$transaction(async (tx): Promise<BookingResult> => {
      // 1. Insert the booking unless its key is already taken. If a concurrent request holds
      //    the same key, PostgreSQL makes this insert wait for that request to finish.
      const [created] = await tx.booking
        .createManyAndReturn({
          data: {
            eventId,
            name: dto.name,
            email: dto.email,
            seats: dto.seats,
            idempotencyKey,
            payloadHash,
          },
          skipDuplicates: true,
          select: { id: true, seq: true, feedbackToken: true },
        })
        .catch((error: unknown) => {
          if (violatedForeignKey(error) === 'bookings_event_id_fkey') {
            throw new NotFoundError('Event');
          }
          throw error;
        });

      // 2. The key was taken: this is a retry, and the booking made the first time is the
      //    answer. It never reaches the seats or the messages, so replaying is safe even on a
      //    full event and never schedules anything twice.
      if (!created) {
        const original = await tx.booking.findUniqueOrThrow({
          where: { idempotencyKey },
          select: { ...bookingSelect, payloadHash: true },
        });
        if (original.payloadHash !== payloadHash) throw new IdempotencyKeyReusedError();
        return { booking: toBookingDto(original), replayed: true };
      }

      // 3. The whole capacity rule is this one statement. The check and the write cannot be
      //    separated: PostgreSQL locks the row, and a statement that had to wait re-checks
      //    its WHERE clause against the committed row before it writes.
      const now = new Date();
      const [event] = await tx.$queryRaw<ClaimedEvent[]>`
        UPDATE events
           SET seats_taken = seats_taken + ${dto.seats}
         WHERE id = ${eventId}::uuid
           AND starts_at > ${now}
           AND seats_taken + ${dto.seats} <= capacity
     RETURNING title, venue, starts_at AS "startsAt"`;

      if (event) {
        // 4. The outbox: the guest's messages commit or roll back together with the seats.
        await this.messages.schedule(
          tx,
          { ...created, name: dto.name, email: dto.email, seats: dto.seats, event },
          now,
        );
        const booking = await tx.booking.findUniqueOrThrow({
          where: { id: created.id },
          select: bookingSelect,
        });
        return { booking: toBookingDto(booking), replayed: false };
      }

      // No seats were taken. The read below only picks the reason. Its count is advisory:
      // a cancellation landing right now can make it larger than what was just refused.
      const current = await tx.event.findUniqueOrThrow({
        where: { id: eventId },
        select: { startsAt: true, capacity: true, seatsTaken: true },
      });
      if (current.startsAt <= now) throw new EventClosedError();
      throw new EventSoldOutError(current.capacity - current.seatsTaken, dto.seats);
    });

    if (result.replayed) return result;
    return { booking: await this.sendConfirmation(result.booking), replayed: false };
  }

  /**
   * The booking is committed whatever happens here. If the confirmation cannot go out now it
   * stays SCHEDULED, and the dispatcher picks it up on its next run. The answer is read again
   * afterwards, so it shows what the messages really are: the scheduler may have sent the
   * confirmation between the commit and this call.
   */
  private async sendConfirmation(booking: BookingDto): Promise<BookingDto> {
    try {
      await this.messages.dispatchConfirmation(booking.id);
      const row = await this.prisma.booking.findUniqueOrThrow({
        where: { id: booking.id },
        select: bookingSelect,
      });
      return toBookingDto(row);
    } catch (error) {
      this.logger.warn(
        `Confirmation of booking ${booking.id} not sent yet, the dispatcher will retry it: ${
          error instanceof Error ? error.name : 'unknown error'
        }`,
      );
      return booking;
    }
  }

  async listForEvent(eventId: string, query: PageQueryDto): Promise<Page<BookingDto>> {
    if (!(await this.events.exists(eventId))) throw new NotFoundError('Event');

    const [rows, total] = await Promise.all([
      this.prisma.booking.findMany({
        where: { eventId },
        select: bookingSelect,
        orderBy: { seq: 'desc' },
        ...toSkipTake(query),
      }),
      this.prisma.booking.count({ where: { eventId } }),
    ]);
    return { items: rows.map(toBookingDto), page: query.page, pageSize: query.pageSize, total };
  }

  async cancel(id: string): Promise<BookingDto> {
    return this.prisma.$transaction(async (tx) => {
      // Only the request that flips CONFIRMED to CANCELLED gets a row back, so the seats are
      // released exactly once however many cancellations arrive, in sequence or in parallel.
      // The messages that have not gone out yet are cancelled in the same transaction. Once
      // the event has started the booking is history, and the same statement leaves it alone.
      const now = new Date();
      const [cancelled] = await tx.booking.updateManyAndReturn({
        where: { id, status: 'CONFIRMED', event: { startsAt: { gt: now } } },
        data: { status: 'CANCELLED' },
        select: { eventId: true, seats: true },
      });
      if (cancelled) {
        await tx.event.update({
          where: { id: cancelled.eventId },
          data: { seatsTaken: { decrement: cancelled.seats } },
        });
        await this.messages.cancelScheduled(tx, id);
      }

      const row = await tx.booking.findUnique({ where: { id }, select: bookingSelect });
      if (!row) throw new NotFoundError('Booking');
      if (!cancelled && row.status === 'CONFIRMED') {
        throw new EventClosedError(
          'This booking can no longer be cancelled: the event has started.',
        );
      }
      return toBookingDto(row);
    });
  }
}

/** Fingerprint of what was asked for, stored with the booking to tell a retry from a reused key. */
function hashPayload(eventId: string, dto: CreateBookingDto): string {
  return createHash('sha256')
    .update(JSON.stringify([eventId, dto.name, dto.email, dto.seats]))
    .digest('hex');
}
