import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type Page, toSkipTake } from '../../common/http/pagination.js';
import type { Env } from '../../config/env.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { bookingReference } from '../bookings/booking-reference.js';
import type { ListMessagesQueryDto } from './dto/list-messages-query.dto.js';
import type { MessageDto } from './dto/message.dto.js';
import { MessageKind, MessageStatus } from './message.enums.js';
import { messageSelect, toMessageDto } from './message.mapper.js';
import { planMessages } from './message-schedule.js';
import { MessageSender } from './message-sender.js';
import { type MessageSettings, renderMessage } from './message-text.js';

/** Rows claimed per dispatcher run. Anything beyond waits for the next run, a minute later. */
const DISPATCH_BATCH_SIZE = 200;

/** What the outbox needs to know about a booking that has just taken its seats. */
export interface NewBooking {
  id: string;
  seq: number;
  name: string;
  email: string;
  seats: number;
  feedbackToken: string;
  event: { title: string; venue: string; startsAt: Date };
}

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);
  private readonly settings: MessageSettings;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sender: MessageSender,
    config: ConfigService<Env, true>,
  ) {
    this.settings = {
      timeZone: config.get('VENUE_TIME_ZONE', { infer: true }),
      webUrl: config.get('PUBLIC_WEB_URL', { infer: true }),
    };
  }

  /**
   * Writes the messages of a new booking into the outbox. Called inside the booking
   * transaction, so a booking never exists without its messages and a refused one has none.
   */
  async schedule(tx: Prisma.TransactionClient, booking: NewBooking, now: Date): Promise<void> {
    const context = {
      guestName: booking.name,
      seats: booking.seats,
      eventTitle: booking.event.title,
      eventStartsAt: booking.event.startsAt,
      venue: booking.event.venue,
      reference: bookingReference(booking.seq),
      feedbackToken: booking.feedbackToken,
    };
    await tx.message.createMany({
      data: planMessages(booking.event.startsAt, now).map(({ kind, scheduledFor }) => ({
        bookingId: booking.id,
        kind,
        recipient: booking.email,
        scheduledFor,
        ...renderMessage(kind, context, this.settings),
      })),
    });
  }

  /** Called in the cancelling transaction: whatever has not gone out yet never will. */
  async cancelScheduled(tx: Prisma.TransactionClient, bookingId: string): Promise<void> {
    await tx.message.updateMany({
      where: { bookingId, status: MessageStatus.SCHEDULED },
      data: { status: MessageStatus.CANCELLED },
    });
  }

  /**
   * Sends every message that is due, oldest first, and returns how many went out. Each row is
   * claimed on its own before it is sent, so two dispatchers running at once (a scheduler tick
   * and a booking, or two instances) never send the same message, and a message cancelled a
   * moment earlier is never sent. A reminder whose event has already started is cancelled
   * instead: it would arrive too late to help. A late feedback request still goes out.
   */
  async dispatchDue(now: Date = new Date()): Promise<number> {
    await this.prisma.message.updateMany({
      where: { status: MessageStatus.SCHEDULED, ...staleReminder(now) },
      data: { status: MessageStatus.CANCELLED },
    });

    const due = await this.prisma.message.findMany({
      where: { status: MessageStatus.SCHEDULED, scheduledFor: { lte: now } },
      select: { id: true },
      orderBy: [{ scheduledFor: 'asc' }, { id: 'asc' }],
      take: DISPATCH_BATCH_SIZE,
    });

    let sent = 0;
    for (const { id } of due) {
      if (await this.claimAndSend({ id, scheduledFor: { lte: now } }, now)) sent += 1;
    }
    return sent;
  }

  /**
   * Sends the confirmation of a booking at once, instead of up to a minute later. Returns
   * when it went out, or null if it was not this call that sent it.
   */
  async dispatchConfirmation(bookingId: string, now: Date = new Date()): Promise<Date | null> {
    const sent = await this.claimAndSend({ bookingId, kind: MessageKind.CONFIRMATION }, now);
    return sent ? now : null;
  }

  async list(query: ListMessagesQueryDto): Promise<Page<MessageDto>> {
    const where: Prisma.MessageWhereInput = {
      status: query.status,
      kind: query.kind,
      ...(query.eventId && { booking: { eventId: query.eventId } }),
    };

    const [rows, total] = await Promise.all([
      this.prisma.message.findMany({
        where,
        select: messageSelect,
        orderBy: [{ scheduledFor: 'desc' }, { id: 'asc' }],
        ...toSkipTake(query),
      }),
      this.prisma.message.count({ where }),
    ]);
    return { items: rows.map(toMessageDto), page: query.page, pageSize: query.pageSize, total };
  }

  /**
   * The claim is one conditional UPDATE from SCHEDULED to SENT: of any number of concurrent
   * attempts on a row, exactly one gets it back. Only that one hands it to the sender. A
   * reminder that went stale after the sweep in dispatchDue is never claimed.
   */
  private async claimAndSend(where: Prisma.MessageWhereInput, now: Date): Promise<boolean> {
    const [claimed] = await this.prisma.message.updateManyAndReturn({
      where: { ...where, status: MessageStatus.SCHEDULED, NOT: staleReminder(now) },
      data: { status: MessageStatus.SENT, sentAt: now },
      select: { id: true, kind: true, recipient: true, subject: true, body: true },
    });
    if (!claimed) return false;

    try {
      await this.sender.send(claimed);
      return true;
    } catch {
      await this.release(claimed.id);
      this.logger.warn(`Message ${claimed.id} (${claimed.kind}) was not sent, it will be retried`);
      return false;
    }
  }

  /** Puts a message the sender refused back in the queue, unless its booking was cancelled meanwhile. */
  private async release(id: string): Promise<void> {
    const requeued = await this.prisma.message.updateMany({
      where: { id, status: MessageStatus.SENT, booking: { status: 'CONFIRMED' } },
      data: { status: MessageStatus.SCHEDULED, sentAt: null },
    });
    if (requeued.count === 0) {
      await this.prisma.message.updateMany({
        where: { id, status: MessageStatus.SENT },
        data: { status: MessageStatus.CANCELLED, sentAt: null },
      });
    }
  }
}

/** A reminder is stale once its event has started: there is nothing left to remind of. */
function staleReminder(now: Date): Prisma.MessageWhereInput {
  return { kind: MessageKind.REMINDER, booking: { event: { startsAt: { lte: now } } } };
}
