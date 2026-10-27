import { describe, expect, it } from 'vitest';
import { MessagesService } from '../src/modules/messages/messages.service.js';
import {
  book,
  createBooking,
  createEvent,
  daysFromNow,
  expectProblem,
  signIn,
} from './support/fixtures.js';
import { useTestApp } from './support/test-app.js';

describe('GET /dashboard', () => {
  const t = useTestApp();

  it('sums up bookings, messages and feedback for the staff overview', async () => {
    const { auth } = await signIn(t, 'STAFF');
    const soon = await createEvent(t, { title: 'Soon', startsAt: daysFromNow(2) });
    await createEvent(t, { title: 'Later', startsAt: daysFromNow(9) });
    const past = await createEvent(t, { title: 'Past', startsAt: daysFromNow(-2) });
    await book(t, soon.id, 2);
    await book(t, soon.id, 3);
    // An old booking, outside the last 7 days, and one that was cancelled: neither counts.
    await createBooking(t, past.id, { createdAt: daysFromNow(-20), seats: 4 });
    await createBooking(t, soon.id, { status: 'CANCELLED', seats: 1 });
    const rated = await createBooking(t, past.id, { createdAt: daysFromNow(-10) });
    await t.api.post(`/feedback/${rated.feedbackToken}`).send({ rating: 5, comment: 'Great.' });

    const response = await t.api.get('/dashboard').set(auth);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      upcomingEvents: [
        expect.objectContaining({ title: 'Soon' }),
        expect.objectContaining({ title: 'Later' }),
      ],
      bookingsLast7Days: 2,
      seatsBookedLast7Days: 5,
      messagesSentLast30Days: 2,
      messagesScheduled: 4,
      feedback: { average: 5, count: 1, distribution: [0, 0, 0, 0, 1] },
      recentFeedback: [
        expect.objectContaining({
          rating: 5,
          comment: 'Great.',
          event: { id: past.id, title: 'Past' },
        }),
      ],
    });
  });

  it('counts a message as sent once the dispatcher has sent it', async () => {
    const { auth } = await signIn(t, 'ADMIN');
    const event = await createEvent(t, { startsAt: daysFromNow(3) });
    await book(t, event.id, 1);
    await t.app.get(MessagesService).dispatchDue(daysFromNow(2.5));

    const response = await t.api.get('/dashboard').set(auth);

    expect(response.body).toMatchObject({ messagesSentLast30Days: 2, messagesScheduled: 1 });
  });

  it('requires a login', async () => {
    expectProblem(await t.api.get('/dashboard'), 401, 'UNAUTHENTICATED');
  });
});
