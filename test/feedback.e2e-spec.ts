import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  createBooking,
  createEvent,
  daysFromNow,
  expectProblem,
  signIn,
} from './support/fixtures.js';
import { type TestApp, useTestApp } from './support/test-app.js';

describe('feedback', () => {
  const t = useTestApp();

  describe('GET /feedback/:token', () => {
    it('shows the guest what they are rating, without a login', async () => {
      const event = await createEvent(t, { title: 'Jazz Night', startsAt: daysFromNow(-1) });
      const booking = await createBooking(t, event.id, { name: 'Ruth Ellen Calder' });

      const response = await t.api.get(`/feedback/${booking.feedbackToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        eventTitle: 'Jazz Night',
        eventStartsAt: event.startsAt.toISOString(),
        guestFirstName: 'Ruth',
        submitted: false,
        rating: null,
      });
    });

    it('answers FEEDBACK_NOT_FOUND for an unknown token and VALIDATION_FAILED for a malformed one', async () => {
      expectProblem(await t.api.get(`/feedback/${randomUUID()}`), 404, 'FEEDBACK_NOT_FOUND');

      const malformed = await t.api.get('/feedback/not-a-token');
      expectProblem(malformed, 400, 'VALIDATION_FAILED');
      expect(malformed.body).toMatchObject({
        errors: [{ field: 'token', message: 'Feedback link must be a valid UUID.' }],
      });
    });

    it('answers FEEDBACK_NOT_OPEN before the event starts and for a cancelled booking', async () => {
      const future = await createEvent(t, { startsAt: daysFromNow(2) });
      const past = await createEvent(t, { startsAt: daysFromNow(-2) });
      const early = await createBooking(t, future.id);
      const cancelled = await createBooking(t, past.id, { status: 'CANCELLED' });

      expectProblem(await t.api.get(`/feedback/${early.feedbackToken}`), 409, 'FEEDBACK_NOT_OPEN');
      expectProblem(
        await t.api.get(`/feedback/${cancelled.feedbackToken}`),
        409,
        'FEEDBACK_NOT_OPEN',
      );
    });
  });

  describe('POST /feedback/:token', () => {
    it('stores a rating with a trimmed comment, once', async () => {
      const event = await createEvent(t, { startsAt: daysFromNow(-1) });
      const booking = await createBooking(t, event.id);
      const url = `/feedback/${booking.feedbackToken}`;

      const created = await t.api.post(url).send({ rating: 4, comment: '  Lovely night.  ' });
      const again = await t.api.post(url).send({ rating: 1 });
      const after = await t.api.get(url);

      expect(created.status).toBe(201);
      expect(created.body).toEqual({
        rating: 4,
        comment: 'Lovely night.',
        createdAt: expect.any(String),
      });
      expectProblem(again, 409, 'FEEDBACK_ALREADY_SUBMITTED');
      expect(after.body).toMatchObject({ submitted: true, rating: 4 });
      expect(await t.prisma.feedback.findMany({ select: { rating: true } })).toEqual([
        { rating: 4 },
      ]);
    });

    it('stores an empty or missing comment as null', async () => {
      const event = await createEvent(t, { startsAt: daysFromNow(-1) });
      const blank = await createBooking(t, event.id);
      const missing = await createBooking(t, event.id);

      const withBlank = await t.api
        .post(`/feedback/${blank.feedbackToken}`)
        .send({ rating: 5, comment: '   ' });
      const withNone = await t.api.post(`/feedback/${missing.feedbackToken}`).send({ rating: 5 });

      expect(withBlank.body).toMatchObject({ rating: 5, comment: null });
      expect(withNone.body).toMatchObject({ rating: 5, comment: null });
    });

    it('accepts exactly one of many simultaneous submissions', async () => {
      const event = await createEvent(t, { startsAt: daysFromNow(-1) });
      const booking = await createBooking(t, event.id);

      const responses = await Promise.all(
        [1, 2, 3, 4, 5].map((rating) =>
          t.api.post(`/feedback/${booking.feedbackToken}`).send({ rating }),
        ),
      );

      expect(responses.filter((response) => response.status === 201)).toHaveLength(1);
      for (const response of responses.filter((candidate) => candidate.status !== 201)) {
        expectProblem(response, 409, 'FEEDBACK_ALREADY_SUBMITTED');
      }
      expect(await t.prisma.feedback.count()).toBe(1);
    });

    it('rejects a rating outside 1 to 5 and a comment over 1000 characters', async () => {
      const event = await createEvent(t, { startsAt: daysFromNow(-1) });
      const booking = await createBooking(t, event.id);
      const send = (body: object) => t.api.post(`/feedback/${booking.feedbackToken}`).send(body);

      for (const body of [{ rating: 0 }, { rating: 6 }, { rating: 4.5 }, {}, { rating: '5' }]) {
        const response = await send(body);
        expectProblem(response, 400, 'VALIDATION_FAILED');
        expect(response.body).toMatchObject({ errors: [{ field: 'rating' }] });
      }
      const long = await send({ rating: 5, comment: 'x'.repeat(1001) });
      expectProblem(long, 400, 'VALIDATION_FAILED');
      expect(long.body).toMatchObject({
        errors: [{ field: 'comment', message: 'Comment must be at most 1000 characters.' }],
      });
      expect(await t.prisma.feedback.count()).toBe(0);
    });

    it('gives the same answers as GET for unknown, early and cancelled bookings', async () => {
      const future = await createEvent(t, { startsAt: daysFromNow(2) });
      const past = await createEvent(t, { startsAt: daysFromNow(-2) });
      const early = await createBooking(t, future.id);
      const cancelled = await createBooking(t, past.id, { status: 'CANCELLED' });
      const rate = (token: string) => t.api.post(`/feedback/${token}`).send({ rating: 5 });

      expectProblem(await rate(randomUUID()), 404, 'FEEDBACK_NOT_FOUND');
      expectProblem(await rate(early.feedbackToken), 409, 'FEEDBACK_NOT_OPEN');
      expectProblem(await rate(cancelled.feedbackToken), 409, 'FEEDBACK_NOT_OPEN');
      expect(await t.prisma.feedback.count()).toBe(0);
    });
  });

  describe('staff views', () => {
    it('lists feedback newest first, filtered by event and rating', async () => {
      const { auth } = await signIn(t, 'STAFF');
      const jazz = await createEvent(t, { title: 'Jazz Night', startsAt: daysFromNow(-3) });
      const film = await createEvent(t, { title: 'Film Night', startsAt: daysFromNow(-2) });
      const first = await rate(t, jazz.id, 5, 'Superb.', 'Lena Varga');
      await rate(t, jazz.id, 3, null, 'Owen Price');
      await rate(t, film.id, 5, 'Great film.', 'Ruth Calder');

      const all = await t.api.get('/feedback').set(auth);
      const fives = await t.api.get('/feedback').query({ rating: 5 }).set(auth);
      const jazzOnly = await t.api.get('/feedback').query({ eventId: jazz.id }).set(auth);

      expect(all.status).toBe(200);
      expect(all.body).toMatchObject({ page: 1, pageSize: 20, total: 3 });
      expect(guests(all.body)).toEqual(['Ruth Calder', 'Owen Price', 'Lena Varga']);
      expect(guests(fives.body)).toEqual(['Ruth Calder', 'Lena Varga']);
      expect(guests(jazzOnly.body)).toEqual(['Owen Price', 'Lena Varga']);
      const { items } = all.body as { items: unknown[] };
      expect(items.at(-1)).toEqual({
        id: expect.any(String),
        rating: 5,
        comment: 'Superb.',
        createdAt: expect.any(String),
        guestName: 'Lena Varga',
        bookingReference: expect.stringMatching(/^VD-[0-9A-Z]{6}$/),
        event: { id: jazz.id, title: 'Jazz Night' },
      });
      expect(first.rating).toBe(5);
    });

    it('summarises the ratings overall and per event', async () => {
      const { auth } = await signIn(t, 'ADMIN');
      const jazz = await createEvent(t, { startsAt: daysFromNow(-3) });
      const film = await createEvent(t, { startsAt: daysFromNow(-2) });
      await rate(t, jazz.id, 5);
      await rate(t, jazz.id, 4);
      await rate(t, jazz.id, 4);
      await rate(t, film.id, 2);

      const overall = await t.api.get('/feedback-summary').set(auth);
      const forJazz = await t.api.get('/feedback-summary').query({ eventId: jazz.id }).set(auth);
      const forNothing = await t.api
        .get('/feedback-summary')
        .query({ eventId: randomUUID() })
        .set(auth);

      expect(overall.body).toEqual({ average: 3.8, count: 4, distribution: [0, 1, 0, 2, 1] });
      expect(forJazz.body).toEqual({ average: 4.3, count: 3, distribution: [0, 0, 0, 2, 1] });
      expect(forNothing.body).toEqual({ average: null, count: 0, distribution: [0, 0, 0, 0, 0] });
    });

    it('shows the rating on the booking', async () => {
      const { auth } = await signIn(t, 'STAFF');
      const event = await createEvent(t, { startsAt: daysFromNow(-1) });
      await rate(t, event.id, 4);

      const response = await t.api.get(`/events/${event.id}/bookings`).set(auth);

      expect(response.body).toMatchObject({ items: [{ rating: 4, messages: [] }] });
    });

    it('requires a login and valid filters', async () => {
      const { auth } = await signIn(t, 'STAFF');

      expectProblem(await t.api.get('/feedback'), 401, 'UNAUTHENTICATED');
      expectProblem(await t.api.get('/feedback-summary'), 401, 'UNAUTHENTICATED');
      const invalid = await t.api.get('/feedback').query({ rating: 6, eventId: 'x' }).set(auth);
      expectProblem(invalid, 400, 'VALIDATION_FAILED');
      expectProblem(
        await t.api.get('/feedback-summary').query({ eventId: 'x' }).set(auth),
        400,
        'VALIDATION_FAILED',
      );
    });
  });
});

/** A booking of the event with its feedback, rated through the public endpoint. */
async function rate(
  t: TestApp,
  eventId: string,
  rating: number,
  comment: string | null = null,
  name = 'Lena Varga',
): Promise<{ rating: number }> {
  const booking = await createBooking(t, eventId, { name });
  const response = await t.api
    .post(`/feedback/${booking.feedbackToken}`)
    .send({ rating, ...(comment && { comment }) })
    .expect(201);
  return response.body as { rating: number };
}

function guests(page: unknown): string[] {
  return (page as { items: { guestName: string }[] }).items.map((item) => item.guestName);
}
