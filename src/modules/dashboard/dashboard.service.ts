import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { BookingStatus } from '../bookings/booking-status.js';
import { EventsService } from '../events/events.service.js';
import { FeedbackService } from '../feedback/feedback.service.js';
import { MessageStatus } from '../messages/message.enums.js';
import type { DashboardDto } from './dto/dashboard.dto.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const LIST_SIZE = 5;

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
    private readonly feedback: FeedbackService,
  ) {}

  async get(now: Date = new Date()): Promise<DashboardDto> {
    const weekAgo = new Date(now.getTime() - 7 * DAY_MS);
    const monthAgo = new Date(now.getTime() - 30 * DAY_MS);
    const recentBookings = { status: BookingStatus.CONFIRMED, createdAt: { gte: weekAgo } };

    const [upcoming, bookings, messagesSent, messagesScheduled, summary, recentFeedback] =
      await Promise.all([
        this.events.list({ page: 1, pageSize: LIST_SIZE, when: 'upcoming' }, now),
        this.prisma.booking.aggregate({
          where: recentBookings,
          _count: { _all: true },
          _sum: { seats: true },
        }),
        this.prisma.message.count({
          where: { status: MessageStatus.SENT, sentAt: { gte: monthAgo } },
        }),
        this.prisma.message.count({ where: { status: MessageStatus.SCHEDULED } }),
        this.feedback.summary(),
        this.feedback.latest(LIST_SIZE),
      ]);

    return {
      upcomingEvents: upcoming.items,
      bookingsLast7Days: bookings._count._all,
      seatsBookedLast7Days: bookings._sum.seats ?? 0,
      messagesSentLast30Days: messagesSent,
      messagesScheduled,
      feedback: summary,
      recentFeedback,
    };
  }
}
