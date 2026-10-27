import { describe, expect, it } from 'vitest';
import { summariseRatings } from './feedback-summary.js';

describe('summariseRatings', () => {
  it('has no average when there is no feedback', () => {
    expect(summariseRatings([])).toEqual({
      average: null,
      count: 0,
      distribution: [0, 0, 0, 0, 0],
    });
  });

  it('counts each rating in its own slot, 1 first, and averages to one decimal', () => {
    const summary = summariseRatings([
      { rating: 5, count: 8 },
      { rating: 4, count: 4 },
      { rating: 2, count: 1 },
    ]);

    // (40 + 16 + 2) / 13 = 4.4615...
    expect(summary).toEqual({ average: 4.5, count: 13, distribution: [0, 1, 0, 4, 8] });
  });

  it('rounds half up', () => {
    expect(
      summariseRatings([
        { rating: 4, count: 3 },
        { rating: 5, count: 1 },
      ]).average,
    ).toBe(4.3);
    expect(
      summariseRatings([
        { rating: 4, count: 1 },
        { rating: 5, count: 1 },
      ]).average,
    ).toBe(4.5);
  });
});
