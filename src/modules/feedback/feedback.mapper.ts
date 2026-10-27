import type { Prisma } from '../../generated/prisma/client.js';
import { bookingReference } from '../bookings/booking-reference.js';
import type { FeedbackItemDto, SubmittedFeedbackDto } from './dto/feedback.dto.js';

export const submittedFeedbackSelect = {
  rating: true,
  comment: true,
  createdAt: true,
} satisfies Prisma.FeedbackSelect;

type SubmittedFeedbackRow = Prisma.FeedbackGetPayload<{ select: typeof submittedFeedbackSelect }>;

export function toSubmittedFeedbackDto(row: SubmittedFeedbackRow): SubmittedFeedbackDto {
  return { rating: row.rating, comment: row.comment, createdAt: row.createdAt.toISOString() };
}

export const feedbackItemSelect = {
  id: true,
  rating: true,
  comment: true,
  createdAt: true,
  booking: {
    select: { seq: true, name: true, event: { select: { id: true, title: true } } },
  },
} satisfies Prisma.FeedbackSelect;

type FeedbackItemRow = Prisma.FeedbackGetPayload<{ select: typeof feedbackItemSelect }>;

export function toFeedbackItemDto(row: FeedbackItemRow): FeedbackItemDto {
  return {
    id: row.id,
    rating: row.rating,
    comment: row.comment,
    createdAt: row.createdAt.toISOString(),
    guestName: row.booking.name,
    bookingReference: bookingReference(row.booking.seq),
    event: row.booking.event,
  };
}
