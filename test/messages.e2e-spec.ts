import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MessageSender } from '../src/modules/messages/message-sender.js';
import { MessagesService } from '../src/modules/messages/messages.service.js';
import { book, createEvent, daysFromNow, expectProblem, signIn } from './support/fixtures.js';
import { useTestApp } from './support/test-app.js';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

interface BookingMessage {
  kind: string;
  status: string;
  scheduledFor: string;
  sentAt: string | null;
}

interface BookingBody {
  id: string;
  reference: string;
  messages: BookingMessage[];
}

describe('guest messages', () => {
  const t = useTestApp();
  const messages = (): MessagesService => t.app.get(MessagesService);

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('when a booking is made', () => {
    it('schedules a confirmation, a reminder the day before and a feedback request the day after', async () => {
      const event = await createEvent(t, { title: 'Jazz Night', startsAt: daysFromNow(7) });
      const startsAt = event.startsAt.getTime();

      const response = await book(t, event.id, 2);

      expect(response.status).toBe(201);
      const booking = response.body as BookingBody;
      expect(booking.messages).toEqual([
        {
          kind: 'CONFIRMATION',
          status: 'SENT',
          scheduledFor: expect.any(String),
          sentAt: expect.any(String),
        },
        {
          kind: 'REMINDER',
          status: 'SCHEDULED',
          scheduledFor: new Date(startsAt - DAY_MS).toISOString(),
          sentAt: null,
        },
        {
          kind: 'FEEDBACK_REQUEST',
          status: 'SCHEDULED',
          scheduledFor: new Date(startsAt + DAY_MS).toISOString(),
          sentAt: null,
        },
      ]);

      const rows = await t.prisma.message.findMany({
        where: { bookingId: booking.id },
        orderBy: { scheduledFor: 'asc' },
      });
      const { feedbackToken } = await t.prisma.booking.findUniqueOrThrow({
        where: { id: booking.id },
      });
      expect(rows.map((row) => [row.kind, row.recipient, row.subject])).toEqual([
        ['CONFIRMATION', 'lena@example.com', 'Your seats for Jazz Night'],
        ['REMINDER', 'lena@example.com', 'Tomorrow: Jazz Night'],
        ['FEEDBACK_REQUEST', 'lena@example.com', 'How was Jazz Night?'],
      ]);
      expect(rows[0]?.body).toContain(`Booking reference: ${booking.reference}`);
      expect(rows[2]?.body).toContain(`http://localhost:4200/feedback/${feedbackToken}`);
    });

    it('sends the confirmation right away, before any dispatcher run', async () => {
      const event = await createEvent(t);
      const before = new Date();

      const { body } = (await book(t, event.id, 1)) as { body: BookingBody };

      const confirmation = await t.prisma.message.findUniqueOrThrow({
        where: { bookingId_kind: { bookingId: body.id, kind: 'CONFIRMATION' } },
      });
      expect(confirmation.status).toBe('SENT');
      expect(confirmation.sentAt?.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(body.messages[0]?.sentAt).toBe(confirmation.sentAt?.toISOString());
      // Nothing else is due yet, and the confirmation is not sent a second time.
      expect(await messages().dispatchDue()).toBe(0);
    });

    it('shows the confirmation as sent when a scheduler run sent it first', async () => {
      const event = await createEvent(t);
      // The scheduler claims the confirmation between the commit and the request's own attempt.
      vi.spyOn(messages(), 'dispatchConfirmation').mockImplementationOnce(async () => {
        expect(await messages().dispatchDue()).toBe(1);
        return null;
      });

      const { body } = (await book(t, event.id, 1)) as { body: BookingBody };

      const confirmation = await t.prisma.message.findUniqueOrThrow({
        where: { bookingId_kind: { bookingId: body.id, kind: 'CONFIRMATION' } },
      });
      expect(confirmation.status).toBe('SENT');
      expect(body.messages[0]).toEqual({
        kind: 'CONFIRMATION',
        status: 'SENT',
        scheduledFor: confirmation.scheduledFor.toISOString(),
        sentAt: confirmation.sentAt?.toISOString(),
      });
    });

    it('still books when the confirmation cannot be sent, and the dispatcher retries it', async () => {
      const event = await createEvent(t);
      vi.spyOn(t.app.get(MessageSender), 'send').mockRejectedValueOnce(new Error('offline'));

      const response = await book(t, event.id, 1);

      expect(response.status).toBe(201);
      const { body } = response as { body: BookingBody };
      expect(body.messages[0]).toMatchObject({ kind: 'CONFIRMATION', status: 'SCHEDULED' });
      expect(await messages().dispatchDue()).toBe(1);
      const confirmation = await t.prisma.message.findUniqueOrThrow({
        where: { bookingId_kind: { bookingId: body.id, kind: 'CONFIRMATION' } },
      });
      expect(confirmation.status).toBe('SENT');
    });

    it('gives no reminder to a booking made less than 25 hours before the event', async () => {
      const event = await createEvent(t, { startsAt: new Date(Date.now() + 24.5 * HOUR_MS) });

      const { body } = (await book(t, event.id, 1)) as { body: BookingBody };

      expect(body.messages.map((message) => message.kind)).toEqual([
        'CONFIRMATION',
        'FEEDBACK_REQUEST',
      ]);
    });

    it('schedules nothing again when the request is replayed', async () => {
      const event = await createEvent(t);
      const key = randomUUID();

      const original = await book(t, event.id, 2, key);
      const retry = await book(t, event.id, 2, key);

      expect(retry.status).toBe(200);
      expect(retry.body).toEqual(original.body);
      expect(await t.prisma.message.count()).toBe(3);
    });

    it('schedules nothing for a refused booking', async () => {
      const event = await createEvent(t, { capacity: 1 });

      expectProblem(await book(t, event.id, 2), 409, 'EVENT_SOLD_OUT');
      expect(await t.prisma.message.count()).toBe(0);
    });
  });

  describe('when a booking is cancelled', () => {
    it('cancels what has not gone out and keeps what has', async () => {
      const { auth } = await signIn(t, 'STAFF');
      const event = await createEvent(t);
      const { body: booking } = (await book(t, event.id, 2)) as { body: BookingBody };

      await t.api.post(`/bookings/${booking.id}/cancel`).set(auth).expect(200);

      const rows = await t.prisma.message.findMany({ where: { bookingId: booking.id } });
      expect(Object.fromEntries(rows.map((row) => [row.kind, row.status]))).toEqual({
        CONFIRMATION: 'SENT',
        REMINDER: 'CANCELLED',
        FEEDBACK_REQUEST: 'CANCELLED',
      });
    });
  });

  describe('MessagesService.dispatchDue', () => {
    it('sends each due message once and never a cancelled one', async () => {
      const { auth } = await signIn(t, 'STAFF');
      const event = await createEvent(t, { startsAt: daysFromNow(7) });
      const { body: kept } = (await book(t, event.id, 1)) as { body: BookingBody };
      const { body: cancelled } = (await book(t, event.id, 1)) as { body: BookingBody };
      await t.api.post(`/bookings/${cancelled.id}/cancel`).set(auth).expect(200);
      const reminderTime = new Date(event.startsAt.getTime() - DAY_MS + 60_000);

      const first = await messages().dispatchDue(reminderTime);
      const second = await messages().dispatchDue(reminderTime);

      expect(first).toBe(1);
      expect(second).toBe(0);
      const reminders = await t.prisma.message.findMany({ where: { kind: 'REMINDER' } });
      expect(reminders.find((row) => row.bookingId === kept.id)).toMatchObject({
        status: 'SENT',
        sentAt: reminderTime,
      });
      expect(reminders.find((row) => row.bookingId === cancelled.id)).toMatchObject({
        status: 'CANCELLED',
        sentAt: null,
      });
      // The feedback request is not due until the day after the event.
      expect(
        await t.prisma.message.count({ where: { kind: 'FEEDBACK_REQUEST', status: 'SCHEDULED' } }),
      ).toBe(1);
    });

    it('sends a message once even when several dispatchers run at the same moment', async () => {
      const event = await createEvent(t, { startsAt: daysFromNow(3) });
      for (let index = 0; index < 5; index++) await book(t, event.id, 1);
      const reminderTime = daysFromNow(2.5);
      const later = daysFromNow(10);

      const reminders = await Promise.all(
        Array.from({ length: 8 }, () => messages().dispatchDue(reminderTime)),
      );
      const requests = await Promise.all(
        Array.from({ length: 8 }, () => messages().dispatchDue(later)),
      );

      // Five reminders, then five feedback requests, each claimed by exactly one run.
      expect(reminders.reduce((sum, sent) => sum + sent, 0)).toBe(5);
      expect(requests.reduce((sum, sent) => sum + sent, 0)).toBe(5);
      expect(await t.prisma.message.count({ where: { status: 'SENT' } })).toBe(15);
    });

    it('cancels a reminder whose event has started, but still sends a late feedback request', async () => {
      const event = await createEvent(t, { startsAt: daysFromNow(3) });
      const { body: booking } = (await book(t, event.id, 1)) as { body: BookingBody };
      // The dispatcher was down from before the reminder until two days after the event.
      const later = daysFromNow(5);

      expect(await messages().dispatchDue(later)).toBe(1);

      const rows = await t.prisma.message.findMany({ where: { bookingId: booking.id } });
      expect(Object.fromEntries(rows.map((row) => [row.kind, [row.status, row.sentAt]]))).toEqual({
        CONFIRMATION: ['SENT', expect.any(Date)],
        REMINDER: ['CANCELLED', null],
        FEEDBACK_REQUEST: ['SENT', later],
      });
    });

    it('does not send a reminder once its event has started, even if it is the only one due', async () => {
      const event = await createEvent(t, { startsAt: daysFromNow(3) });
      const { body: booking } = (await book(t, event.id, 1)) as { body: BookingBody };
      // The event was moved earlier and has already started.
      await t.prisma.event.update({
        where: { id: event.id },
        data: { startsAt: daysFromNow(-0.1) },
      });
      const sender = vi.spyOn(t.app.get(MessageSender), 'send');

      expect(await messages().dispatchDue()).toBe(0);

      expect(sender).not.toHaveBeenCalled();
      const reminder = await t.prisma.message.findUniqueOrThrow({
        where: { bookingId_kind: { bookingId: booking.id, kind: 'REMINDER' } },
      });
      expect(reminder).toMatchObject({ status: 'CANCELLED', sentAt: null });
    });
  });

  describe('GET /messages', () => {
    it('lists the exact text of every message for staff, latest scheduled first', async () => {
      const { auth } = await signIn(t, 'STAFF');
      const event = await createEvent(t, { title: 'Jazz Night', startsAt: daysFromNow(7) });
      const { body: booking } = (await book(t, event.id, 2)) as { body: BookingBody };

      const response = await t.api.get('/messages').set(auth);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ page: 1, pageSize: 20, total: 3 });
      const { items } = response.body as { items: { kind: string }[] };
      expect(items.map((item) => item.kind)).toEqual([
        'FEEDBACK_REQUEST',
        'REMINDER',
        'CONFIRMATION',
      ]);
      expect(items[2]).toEqual({
        id: expect.any(String),
        kind: 'CONFIRMATION',
        status: 'SENT',
        recipient: 'lena@example.com',
        subject: 'Your seats for Jazz Night',
        body: expect.stringContaining('Hello Lena,'),
        scheduledFor: booking.messages[0]?.scheduledFor,
        sentAt: booking.messages[0]?.sentAt,
        booking: { id: booking.id, reference: booking.reference },
        guestName: 'Lena Varga',
        event: { id: event.id, title: 'Jazz Night' },
      });
    });

    it('filters by kind, status and event', async () => {
      const { auth } = await signIn(t, 'ADMIN');
      const event = await createEvent(t);
      const other = await createEvent(t);
      await book(t, event.id, 1);
      await book(t, other.id, 1);
      const list = (query: Record<string, string>) => t.api.get('/messages').query(query).set(auth);

      const reminders = await list({ kind: 'REMINDER' });
      const sent = await list({ status: 'SENT' });
      const forEvent = await list({ eventId: event.id, kind: 'CONFIRMATION' });

      expect(reminders.body).toMatchObject({ total: 2 });
      expect(sent.body).toMatchObject({
        total: 2,
        items: [{ kind: 'CONFIRMATION' }, { kind: 'CONFIRMATION' }],
      });
      expect(forEvent.body).toMatchObject({ total: 1, items: [{ event: { id: event.id } }] });
    });

    it('requires a login and valid filters', async () => {
      const { auth } = await signIn(t, 'STAFF');

      expectProblem(await t.api.get('/messages'), 401, 'UNAUTHENTICATED');
      const invalid = await t.api
        .get('/messages')
        .query({ status: 'LOST', kind: 'POSTCARD', eventId: '42' })
        .set(auth);
      expectProblem(invalid, 400, 'VALIDATION_FAILED');
      const { errors } = invalid.body as { errors: { field: string }[] };
      expect(errors.map((error) => error.field).sort()).toEqual(['eventId', 'kind', 'status']);
    });
  });
});
