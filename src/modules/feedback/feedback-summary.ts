import type { FeedbackSummaryDto } from './dto/feedback.dto.js';

export interface RatingCount {
  rating: number;
  count: number;
}

/** Average to one decimal, total and count per rating, from the number of ratings of each value. */
export function summariseRatings(counts: RatingCount[]): FeedbackSummaryDto {
  const distribution = [0, 0, 0, 0, 0];
  for (const { rating, count } of counts) {
    if (Number.isInteger(rating) && rating >= 1 && rating <= 5) distribution[rating - 1] = count;
  }

  const count = distribution.reduce((sum, value) => sum + value, 0);
  const total = distribution.reduce((sum, value, index) => sum + value * (index + 1), 0);
  return {
    average: count === 0 ? null : Math.round((total / count) * 10) / 10,
    count,
    distribution,
  };
}
