import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { book, createEvent, daysFromNow, expectProblem, signIn } from './support/fixtures.js';
import { type TestApp, useTestApp } from './support/test-app.js';

describe('bookings', () => {
  const t = useTestApp();

  describe('POST /events/:id/bookings', () => {
    it('reserves the seats and returns the booking', async () => {
      const event = await createEvent(t, { capacity: 10 });

      const response = await book(t, event.id, 3);

      expect(response.status).toBe(201);
      expect(response.body).toEqual({
        id: expect.any(String),
        reference: expect.stringMatching(/^VD-[0-9A-Z]{6}$/),
        eventId: event.id,
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        seats: 3,
        status: 'CONFIRMED',
        createdAt: expect.any(String),
      });
      expect(await seatsTaken(t, event.id)).toBe(3);
    });

    it('rejects invalid fields and a missing or malformed idempotency key, in plain words', async () => {
      const event = await createEvent(t);
      const body = { name: 'Ada Lovelace', email: 'ada@example.com', seats: 2 };
      const url = `/events/${event.id}/bookings`;

      const tooMany = await book(t, event.id, 5);
      const none = await book(t, event.id, 0);
      const noKey = await t.api.post(url).send(body);
      const badKey = await t.api.post(url).set('Idempotency-Key', 'retry-1').send(body);
      const blank = await t.api
        .post(url)
        .set('Idempotency-Key', randomUUID())
        .send({ name: '  ', email: 'ada@', seats: 2 });

      for (const response of [tooMany, none, noKey, badKey, blank]) {
        expectProblem(response, 400, 'VALIDATION_FAILED');
      }
      // Clients show these messages to people as they are, so they are sentences.
      expect(blank.body).toMatchObject({
        errors: [
          { field: 'name', message: 'Name is required.' },
          { field: 'email', message: 'Enter a valid email address.' },
        ],
      });
      expect(tooMany.body).toMatchObject({
        errors: [{ field: 'seats', message: 'Number of seats must be between 1 and 4.' }],
      });
      expect(noKey.body).toMatchObject({ errors: [{ field: 'Idempotency-Key' }] });
      expect(await seatsTaken(t, event.id)).toBe(0);
    });

    it('answers NOT_FOUND for an event that does not exist', async () => {
      expectProblem(await book(t, randomUUID(), 1), 404, 'NOT_FOUND');
    });

    it('refuses a request larger than what is left, and still sells the last seat', async () => {
      const event = await createEvent(t, { capacity: 3 });
      expect((await book(t, event.id, 2)).status).toBe(201);

      const tooLarge = await book(t, event.id, 2);
      const lastSeat = await book(t, event.id, 1);
      const afterSellOut = await book(t, event.id, 1);

      expectProblem(tooLarge, 409, 'EVENT_SOLD_OUT');
      expect(tooLarge.body).toMatchObject({
        seatsLeft: 1,
        detail: 'Only 1 seat left, 2 requested.',
      });
      expect(lastSeat.status).toBe(201);
      expectProblem(afterSellOut, 409, 'EVENT_SOLD_OUT');
      expect(afterSellOut.body).toMatchObject({ seatsLeft: 0 });
      expect(await seatsTaken(t, event.id)).toBe(3);
    });

    it('refuses to book an event that has already started', async () => {
      const event = await createEvent(t, { startsAt: daysFromNow(-1) });

      const response = await book(t, event.id, 1);

      expectProblem(response, 409, 'EVENT_CLOSED');
      expect(await seatsTaken(t, event.id)).toBe(0);
    });
  });

  describe('idempotency', () => {
    it('replays the original booking when the same request is retried', async () => {
      const event = await createEvent(t);
      const key = randomUUID();

      const original = await book(t, event.id, 2, key);
      const retry = await book(t, event.id, 2, key);

      expect(original.status).toBe(201);
      expect(retry.status).toBe(200);
      expect(retry.body).toEqual(original.body);
      expect(await seatsTaken(t, event.id)).toBe(2);
      expect(await t.prisma.booking.count()).toBe(1);
    });

    it('replays the booking even after the event has sold out', async () => {
      const event = await createEvent(t, { capacity: 2 });
      const key = randomUUID();
      const original = await book(t, event.id, 2, key);
      expectProblem(await book(t, event.id, 1), 409, 'EVENT_SOLD_OUT');

      const retry = await book(t, event.id, 2, key);

      expect(original.status).toBe(201);
      expect(retry.status).toBe(200);
      expect(retry.body).toEqual(original.body);
      expect(await seatsTaken(t, event.id)).toBe(2);
    });

    it('rejects a key that is reused for a different request', async () => {
      const event = await createEvent(t);
      const key = randomUUID();
      await book(t, event.id, 2, key);

      const response = await book(t, event.id, 3, key);

      expectProblem(response, 409, 'IDEMPOTENCY_KEY_REUSED');
      expect(await seatsTaken(t, event.id)).toBe(2);
    });

    it('rejects a key that is reused for a different event', async () => {
      const event = await createEvent(t);
      const other = await createEvent(t);
      const key = randomUUID();
      await book(t, event.id, 2, key);

      const response = await book(t, other.id, 2, key);

      expectProblem(response, 409, 'IDEMPOTENCY_KEY_REUSED');
      expect(await seatsTaken(t, other.id)).toBe(0);
      expect(await t.prisma.booking.count()).toBe(1);
    });
  });

  describe('GET /events/:id/bookings', () => {
    it('lists the bookings of one event for staff, newest first', async () => {
      const { auth } = await signIn(t, 'STAFF');
      const event = await createEvent(t);
      const other = await createEvent(t);
      await book(t, event.id, 1);
      await book(t, event.id, 4);
      await book(t, other.id, 2);

      const response = await t.api
        .get(`/events/${event.id}/bookings`)
        .query({ pageSize: 1 })
        .set(auth);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        items: [{ eventId: event.id, seats: 4 }],
        page: 1,
        pageSize: 1,
        total: 2,
      });
    });

    it('requires a login and an existing event', async () => {
      const { auth } = await signIn(t, 'STAFF');
      const event = await createEvent(t);

      expectProblem(await t.api.get(`/events/${event.id}/bookings`), 401, 'UNAUTHENTICATED');
      expectProblem(
        await t.api.get(`/events/${randomUUID()}/bookings`).set(auth),
        404,
        'NOT_FOUND',
      );
    });
  });

  describe('POST /bookings/:id/cancel', () => {
    it('cancels the booking and gives its seats back to the event', async () => {
      const { auth } = await signIn(t, 'STAFF');
      const event = await createEvent(t, { capacity: 4 });
      const { body: booking } = (await book(t, event.id, 4)) as { body: { id: string } };

      const response = await t.api.post(`/bookings/${booking.id}/cancel`).set(auth);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ ...booking, status: 'CANCELLED' });
      expect(await seatsTaken(t, event.id)).toBe(0);
      expect((await book(t, event.id, 4)).status).toBe(201);
    });

    it('does nothing when the booking is already cancelled', async () => {
      const { auth } = await signIn(t, 'ADMIN');
      const event = await createEvent(t);
      await book(t, event.id, 1);
      const { body: booking } = (await book(t, event.id, 3)) as { body: { id: string } };
      const first = await t.api.post(`/bookings/${booking.id}/cancel`).set(auth);

      const second = await t.api.post(`/bookings/${booking.id}/cancel`).set(auth);

      expect(second.status).toBe(200);
      expect(second.body).toEqual(first.body);
      expect(await seatsTaken(t, event.id)).toBe(1);
    });

    it('requires a login and an existing booking', async () => {
      const { auth } = await signIn(t, 'STAFF');
      const event = await createEvent(t);
      const { body: booking } = (await book(t, event.id, 2)) as { body: { id: string } };

      expectProblem(await t.api.post(`/bookings/${booking.id}/cancel`), 401, 'UNAUTHENTICATED');
      expectProblem(
        await t.api.post(`/bookings/${randomUUID()}/cancel`).set(auth),
        404,
        'NOT_FOUND',
      );
      expect(await seatsTaken(t, event.id)).toBe(2);
    });
  });

  describe('database constraint', () => {
    it('refuses a seat counter outside 0..capacity even when written directly', async () => {
      const event = await createEvent(t, { capacity: 5, seatsTaken: 5 });
      const setSeatsTaken = (value: number) =>
        t.prisma.event.update({ where: { id: event.id }, data: { seatsTaken: value } });

      await expect(setSeatsTaken(6)).rejects.toThrow(/events_seats_taken_within_capacity/);
      await expect(setSeatsTaken(-1)).rejects.toThrow(/events_seats_taken_within_capacity/);
      expect(await seatsTaken(t, event.id)).toBe(5);
    });
  });
});

async function seatsTaken(t: TestApp, eventId: string): Promise<number> {
  const response = await t.api.get(`/events/${eventId}`);
  return (response.body as { seatsTaken: number }).seatsTaken;
}
