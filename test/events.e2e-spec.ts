import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createEvent, daysFromNow, expectProblem, signIn } from './support/fixtures.js';
import { useTestApp } from './support/test-app.js';

describe('events', () => {
  const t = useTestApp();

  describe('GET /events', () => {
    it('is public and pages through events in order of start time', async () => {
      await createEvent(t, { title: 'Third', startsAt: daysFromNow(30) });
      await createEvent(t, { title: 'First', startsAt: daysFromNow(10) });
      await createEvent(t, { title: 'Second', startsAt: daysFromNow(20) });

      const first = await t.api.get('/events').query({ page: 1, pageSize: 2 });
      const second = await t.api.get('/events').query({ page: 2, pageSize: 2 });

      expect(first.status).toBe(200);
      expect(first.body).toMatchObject({ page: 1, pageSize: 2, total: 3 });
      expect(titles(first.body)).toEqual(['First', 'Second']);
      expect(second.body).toMatchObject({ page: 2, pageSize: 2, total: 3 });
      expect(titles(second.body)).toEqual(['Third']);
    });

    it('defaults to the first page of 20', async () => {
      const response = await t.api.get('/events');

      expect(response.body).toEqual({ items: [], page: 1, pageSize: 20, total: 0 });
    });

    it('rejects a page size above 100 and a page below 1', async () => {
      const response = await t.api.get('/events').query({ page: 0, pageSize: 101 });

      expectProblem(response, 400, 'VALIDATION_FAILED');
      expect(response.body).toMatchObject({
        errors: [
          { field: 'page', message: 'Page must be at least 1.' },
          { field: 'pageSize', message: 'Page size must be between 1 and 100.' },
        ],
      });
    });
  });

  describe('GET /events/:id', () => {
    it('returns the event with its remaining seats', async () => {
      const event = await createEvent(t, { title: 'Jazz Night', capacity: 60, seatsTaken: 58 });

      const response = await t.api.get(`/events/${event.id}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        id: event.id,
        title: 'Jazz Night',
        description: event.description,
        venue: event.venue,
        startsAt: event.startsAt.toISOString(),
        capacity: 60,
        seatsTaken: 58,
        seatsLeft: 2,
      });
    });

    it('answers NOT_FOUND for an unknown id and VALIDATION_FAILED for a malformed one', async () => {
      expectProblem(await t.api.get(`/events/${randomUUID()}`), 404, 'NOT_FOUND');

      const malformed = await t.api.get('/events/42');
      expectProblem(malformed, 400, 'VALIDATION_FAILED');
      expect(malformed.body).toMatchObject({ errors: [{ field: 'id' }] });
    });
  });

  describe('POST /events', () => {
    const validEvent = {
      title: 'Wine Tasting',
      description: 'Six regional wines.',
      venue: 'Gallery Bar',
      startsAt: '2031-05-17T19:30:00.000Z',
      capacity: 10,
    };

    it('lets an admin create an event that starts with every seat free', async () => {
      const { auth } = await signIn(t, 'ADMIN');

      const response = await t.api.post('/events').set(auth).send(validEvent);

      expect(response.status).toBe(201);
      expect(response.body).toEqual({
        ...validEvent,
        id: expect.any(String),
        seatsTaken: 0,
        seatsLeft: 10,
      });
      const { id } = response.body as { id: string };
      expect((await t.api.get(`/events/${id}`)).body).toEqual(response.body);
    });

    it('requires an explicit offset and stores the instant in UTC', async () => {
      const { auth } = await signIn(t, 'ADMIN');
      const create = (startsAt: string) =>
        t.api
          .post('/events')
          .set(auth)
          .send({ ...validEvent, startsAt });

      const withOffset = await create('2031-05-17T21:30:00+02:00');
      const withoutOffset = await create('2031-05-17T19:30:00');
      const dateOnly = await create('2031-05-17');

      expect(withOffset.status).toBe(201);
      expect(withOffset.body).toMatchObject({ startsAt: '2031-05-17T19:30:00.000Z' });
      for (const response of [withoutOffset, dateOnly]) {
        expectProblem(response, 400, 'VALIDATION_FAILED');
        expect(response.body).toMatchObject({
          errors: [
            {
              field: 'startsAt',
              message: 'Start time must end with Z or a UTC offset such as +02:00.',
            },
          ],
        });
      }
    });

    it('refuses an event that would start in the past', async () => {
      const { auth } = await signIn(t, 'ADMIN');

      const response = await t.api
        .post('/events')
        .set(auth)
        .send({ ...validEvent, startsAt: daysFromNow(-1).toISOString() });

      expectProblem(response, 400, 'VALIDATION_FAILED');
      expect(response.body).toMatchObject({
        errors: [{ field: 'startsAt', message: 'Start time must be in the future.' }],
      });
      expect(await t.prisma.event.count()).toBe(0);
    });

    it('rejects invalid fields and names each of them', async () => {
      const { auth } = await signIn(t, 'ADMIN');

      const response = await t.api
        .post('/events')
        .set(auth)
        .send({ ...validEvent, title: '', startsAt: 'next friday', capacity: 0 });

      expectProblem(response, 400, 'VALIDATION_FAILED');
      const { errors } = response.body as { errors: { field: string }[] };
      expect(errors.map((error) => error.field).sort()).toEqual(['capacity', 'startsAt', 'title']);
      expect(await t.prisma.event.count()).toBe(0);
    });

    it('is closed to staff and to anonymous callers', async () => {
      const staff = await signIn(t, 'STAFF');

      expectProblem(await t.api.post('/events').set(staff.auth).send(validEvent), 403, 'FORBIDDEN');
      expectProblem(await t.api.post('/events').send(validEvent), 401, 'UNAUTHENTICATED');
      expect(await t.prisma.event.count()).toBe(0);
    });
  });
});

function titles(page: unknown): string[] {
  return (page as { items: { title: string }[] }).items.map((event) => event.title);
}
