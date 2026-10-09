import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { book, createEvent, signIn } from './support/fixtures.js';
import { type TestApp, useTestApp } from './support/test-app.js';

/**
 * The reason this project exists. Every request below goes through HTTP against a real
 * PostgreSQL, all at once, and the assertions are exact: no "at most", no tolerance.
 */
describe('seat allocation under concurrency', () => {
  const t = useTestApp();

  it('sells exactly the capacity when 200 parallel requests compete for 50 seats', async () => {
    const CAPACITY = 50;
    const event = await createEvent(t, { capacity: CAPACITY });
    // 1, 2, 3, 4, 1, 2, ... : 500 seats requested in total, ten times what exists.
    const seatCounts = Array.from({ length: 200 }, (_, i) => (i % 4) + 1);

    const attempts = await Promise.all(
      seatCounts.map(async (seats) => ({ seats, response: await book(t, event.id, seats) })),
    );

    const confirmed = attempts.filter(({ response }) => response.status === 201);
    const refused = attempts.filter(({ response }) => response.status !== 201);

    // Fifty of the requests ask for a single seat, and a single seat can only be refused
    // when nothing is left. So the event must end up exactly full, never one seat short.
    expect(sum(confirmed.map(({ seats }) => seats))).toBe(CAPACITY);

    // Everyone else was told why, and nobody was turned away while there was room for them.
    for (const { seats, response } of refused) {
      expect(response.status).toBe(409);
      const problem = response.body as { code: string; seatsLeft: number };
      expect(problem.code).toBe('EVENT_SOLD_OUT');
      expect(problem.seatsLeft).toBeLessThan(seats);
    }

    // The counter and the bookings table agree with what the clients were told.
    const stored = await t.prisma.event.findUniqueOrThrow({ where: { id: event.id } });
    const bookings = await t.prisma.booking.findMany({ where: { eventId: event.id } });
    expect(stored.seatsTaken).toBe(CAPACITY);
    expect(sum(bookings.map((booking) => booking.seats))).toBe(CAPACITY);
    expect(bookings).toHaveLength(confirmed.length);

    const references = confirmed.map(({ response }) => (response.body as Booking).reference);
    expect(new Set(references).size).toBe(confirmed.length);
  });

  it('creates one booking when the same request is sent 30 times at once', async () => {
    const event = await createEvent(t, { capacity: 10 });
    const key = randomUUID();

    const responses = await Promise.all(
      Array.from({ length: 30 }, () => book(t, event.id, 4, key)),
    );

    expect(responses.map((response) => response.status).sort()).toEqual([
      ...Array<number>(29).fill(200),
      201,
    ]);
    expect(new Set(responses.map((response) => (response.body as Booking).id)).size).toBe(1);
    expect(await t.prisma.booking.count()).toBe(1);
    expect(await storedSeatsTaken(t, event.id)).toBe(4);
  });

  it('replays the booking to a concurrent retry even when it took the last seats', async () => {
    const event = await createEvent(t, { capacity: 4 });
    const key = randomUUID();

    const responses = await Promise.all(
      Array.from({ length: 10 }, () => book(t, event.id, 4, key)),
    );

    // The losers find the event full. They must still get the booking, not EVENT_SOLD_OUT.
    expect(responses.map((response) => response.status).sort()).toEqual([
      ...Array<number>(9).fill(200),
      201,
    ]);
    expect(await storedSeatsTaken(t, event.id)).toBe(4);
  });

  it('releases the seats once when a booking is cancelled 20 times at once', async () => {
    const { auth } = await signIn(t, 'STAFF');
    const event = await createEvent(t, { capacity: 10 });
    await book(t, event.id, 3);
    const booking = (await book(t, event.id, 4)).body as Booking;

    const responses = await Promise.all(
      Array.from({ length: 20 }, () => t.api.post(`/bookings/${booking.id}/cancel`).set(auth)),
    );

    for (const response of responses) {
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ id: booking.id, status: 'CANCELLED' });
    }
    expect(await storedSeatsTaken(t, event.id)).toBe(3);
  });
});

interface Booking {
  id: string;
  reference: string;
}

const sum = (values: number[]): number => values.reduce((total, value) => total + value, 0);

async function storedSeatsTaken(t: TestApp, eventId: string): Promise<number> {
  const event = await t.prisma.event.findUniqueOrThrow({ where: { id: eventId } });
  return event.seatsTaken;
}
