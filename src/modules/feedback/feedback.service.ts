import { Injectable } from '@nestjs/common';
import {
  FeedbackAlreadySubmittedError,
  FeedbackNotFoundError,
  FeedbackNotOpenError,
} from '../../common/errors/domain-errors.js';
import { type Page, toSkipTake } from '../../common/http/pagination.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { BookingStatus } from '../bookings/booking-status.js';
import { firstName } from '../bookings/guest-name.js';
import type { CreateFeedbackDto } from './dto/create-feedback.dto.js';
import type {
  FeedbackInvitationDto,
  FeedbackItemDto,
  FeedbackSummaryDto,
  SubmittedFeedbackDto,
} from './dto/feedback.dto.js';
import type { ListFeedbackQueryDto } from './dto/feedback-query.dto.js';
import { summariseRatings } from './feedback-summary.js';
import {
  feedbackItemSelect,
  submittedFeedbackSelect,
  toFeedbackItemDto,
  toSubmittedFeedbackDto,
} from './feedback.mapper.js';

/**
 * Guests have no account: the random token in their feedback link is what identifies the
 * booking. Feedback opens when the event starts, and each booking can rate once.
 */
@Injectable()
export class FeedbackService {
  constructor(private readonly prisma: PrismaService) {}

  async invitation(token: string, now: Date = new Date()): Promise<FeedbackInvitationDto> {
    const booking = await this.openBooking(token, now);
    return {
      eventTitle: booking.event.title,
      eventStartsAt: booking.event.startsAt.toISOString(),
      guestFirstName: firstName(booking.name),
      submitted: booking.feedback !== null,
      rating: booking.feedback?.rating ?? null,
    };
  }

  async submit(
    token: string,
    dto: CreateFeedbackDto,
    now: Date = new Date(),
  ): Promise<SubmittedFeedbackDto> {
    const booking = await this.openBooking(token, now);

    // The unique booking_id decides between two submissions, even simultaneous ones: the
    // first inserts, every other one inserts nothing and is told so.
    const [created] = await this.prisma.feedback.createManyAndReturn({
      data: { bookingId: booking.id, rating: dto.rating, comment: dto.comment ?? null },
      skipDuplicates: true,
      select: submittedFeedbackSelect,
    });
    if (!created) throw new FeedbackAlreadySubmittedError();
    return toSubmittedFeedbackDto(created);
  }

  async list(query: ListFeedbackQueryDto): Promise<Page<FeedbackItemDto>> {
    const where: Prisma.FeedbackWhereInput = {
      rating: query.rating,
      ...(query.eventId && { booking: { eventId: query.eventId } }),
    };

    const [rows, total] = await Promise.all([
      this.prisma.feedback.findMany({
        where,
        select: feedbackItemSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        ...toSkipTake(query),
      }),
      this.prisma.feedback.count({ where }),
    ]);
    return {
      items: rows.map(toFeedbackItemDto),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async summary(eventId?: string): Promise<FeedbackSummaryDto> {
    const groups = await this.prisma.feedback.groupBy({
      by: ['rating'],
      where: eventId ? { booking: { eventId } } : {},
      _count: { _all: true },
    });
    return summariseRatings(
      groups.map((group) => ({ rating: group.rating, count: group._count._all })),
    );
  }

  async latest(count: number): Promise<FeedbackItemDto[]> {
    const rows = await this.prisma.feedback.findMany({
      select: feedbackItemSelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: count,
    });
    return rows.map(toFeedbackItemDto);
  }

  /** The booking behind a token, if it can be rated: it exists, is not cancelled, has started. */
  private async openBooking(token: string, now: Date) {
    const booking = await this.prisma.booking.findUnique({
      where: { feedbackToken: token },
      select: {
        id: true,
        name: true,
        status: true,
        event: { select: { title: true, startsAt: true } },
        feedback: { select: { rating: true } },
      },
    });
    if (!booking) throw new FeedbackNotFoundError();
    if (booking.status === BookingStatus.CANCELLED) throw new FeedbackNotOpenError('cancelled');
    if (booking.event.startsAt > now) throw new FeedbackNotOpenError('not-started');
    return booking;
  }
}
