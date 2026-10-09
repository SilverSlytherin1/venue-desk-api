import { describe, expect, it } from 'vitest';
import { bookingReference } from './booking-reference.js';

describe('bookingReference', () => {
  it('formats a sequence number as VD- plus six unambiguous characters', () => {
    for (const seq of [1, 2, 999, 123_456_789, 2 ** 30 - 1]) {
      expect(bookingReference(seq)).toMatch(/^VD-[0-9A-HJKMNP-TV-Z]{6}$/);
    }
  });

  it('never gives two bookings the same reference', () => {
    const references = new Set<string>();
    for (let seq = 1; seq <= 200_000; seq++) {
      references.add(bookingReference(seq));
    }

    expect(references.size).toBe(200_000);
  });

  it('is stable: a reference already handed to a guest must never change', () => {
    expect(bookingReference(1)).toBe('VD-AHT8G2');
    expect(bookingReference(2)).toBe('VD-G8NKSH');
    expect(bookingReference(42)).toBe('VD-J8M763');
  });
});
