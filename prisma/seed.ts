/**
 * Demo data, documented in the README. Runs once: if the demo admin already exists the script
 * leaves the database alone, so it is safe to run on every start of the compose stack.
 */
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { type Prisma, PrismaClient } from '../src/generated/prisma/client.js';
import { hashPassword } from '../src/modules/auth/password.js';
import { bookingReference } from '../src/modules/bookings/booking-reference.js';
import { planMessages } from '../src/modules/messages/message-schedule.js';
import { type MessageSettings, renderMessage } from '../src/modules/messages/message-text.js';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const now = new Date();
const daysFromNow = (days: number): Date => new Date(now.getTime() + days * DAY_MS);

/** Events are dated relative to the day of seeding, so the demo always has upcoming ones. */
function eveningIn(days: number, hour: number, minute = 0): Date {
  const date = daysFromNow(days);
  date.setUTCHours(hour, minute, 0, 0);
  return date;
}

/**
 * Starts a little over 24 hours after the seed runs, on a round five minutes. Its reminders
 * fall due about a quarter of an hour into a demo, so the staff see them flip to SENT live.
 */
function justOverADayFromNow(): Date {
  const step = 5 * MINUTE_MS;
  return new Date(Math.ceil((now.getTime() + DAY_MS + 15 * MINUTE_MS) / step) * step);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required to seed the database.');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

/** The settings the API renders messages with, and the same defaults. */
const messageSettings: MessageSettings = {
  timeZone: process.env.VENUE_TIME_ZONE ?? 'Europe/Rome',
  webUrl: (process.env.PUBLIC_WEB_URL ?? 'http://localhost:4200').replace(/\/+$/, ''),
};

/** Fixed, so a presenter can open the feedback page of a past booking straight away. */
const DEMO_FEEDBACK_TOKEN = '5f0c2a9e-8d1b-4c3e-9a7f-2b6d4e8c1a35';

const admin = { id: randomUUID(), name: 'Alex Admin', email: 'admin@venuedesk.test' };
const sam = { id: randomUUID(), name: 'Sam Staff', email: 'sam@venuedesk.test' };
const robin = { id: randomUUID(), name: 'Robin Staff', email: 'robin@venuedesk.test' };

interface EventPlan {
  id: string;
  title: string;
  description: string;
  venue: string;
  startsAt: Date;
  capacity: number;
  /** Seats of each confirmed booking, so the counter and the bookings agree. */
  booked: number[];
  /** Rating left by each confirmed booking, null for none. Past events only. */
  ratings?: (number | null)[];
  /** Comment that came with each rating, null for a rating without one. */
  comments?: (string | null)[];
  /** Seats of bookings that were cancelled. They hold no seats. */
  cancelled?: number[];
}

const eventPlans: EventPlan[] = [
  {
    id: randomUUID(),
    title: 'Autumn Jazz Night',
    description: 'Three sets from the house quintet, doors open one hour before.',
    venue: 'Main Hall',
    startsAt: eveningIn(21, 20),
    capacity: 200,
    booked: [2, 4, 3],
    cancelled: [2],
  },
  {
    id: randomUUID(),
    title: 'Indie Film Premiere',
    description: 'First screening followed by a conversation with the director.',
    venue: 'Screening Room',
    startsAt: eveningIn(7, 19, 30),
    capacity: 60,
    booked: [...Array<number>(14).fill(4), 2],
  },
  {
    id: randomUUID(),
    title: 'Stand-up Comedy Showcase',
    description: 'Five comedians, one night. Sold out.',
    venue: 'Cellar Stage',
    startsAt: eveningIn(10, 21),
    capacity: 40,
    booked: Array<number>(10).fill(4),
  },
  {
    id: randomUUID(),
    title: 'Wine Tasting Masterclass',
    description: 'Six regional wines introduced by the sommelier. Small group.',
    venue: 'Gallery Bar',
    startsAt: eveningIn(14, 18, 30),
    capacity: 10,
    booked: [2, 2],
  },
  {
    id: randomUUID(),
    title: 'Acoustic Session on the Terrace',
    description: 'A singer, a guitar and the city lights. Bring a jacket.',
    venue: 'Roof Terrace',
    startsAt: justOverADayFromNow(),
    capacity: 30,
    booked: [2, 2, 4, 1, 3, 2],
  },
  {
    id: randomUUID(),
    title: 'Piano Trio Evening',
    description: 'Haydn, Brahms and a surprise encore.',
    venue: 'Main Hall',
    startsAt: eveningIn(-3, 19),
    capacity: 80,
    booked: [2, 2, 3, 1, 4, 2, 2, 2],
    // The fourth booking has not rated yet: it carries the demo feedback token.
    ratings: [5, 4, 5, null, 5, 4, 5, 3],
    comments: [
      'The Brahms was breathtaking, and the encore had the whole hall on its feet.',
      'Beautiful playing. The hall got quite warm in the second half.',
      'My first classical concert, and I am already looking for the next one.',
      null,
      null,
      'Lovely programme, but the interval was too short for the queue at the bar.',
      'We sat in row F and the sound was perfect.',
      'Fine musicians, but it started twenty minutes late and we left before the encore.',
    ],
  },
  {
    id: randomUUID(),
    title: 'Open Mic Night',
    description: 'Ten slots, five minutes each. Sign up at the bar.',
    venue: 'Cellar Stage',
    startsAt: eveningIn(-10, 20),
    capacity: 40,
    booked: [2, 1, 2, 4, 2, 3, 1, 2, 2, 2],
    ratings: [5, 5, 4, 4, 5, 2, null, 4, 5, 3],
    comments: [
      'So much talent in one small room. The poet in the third slot was my highlight.',
      null,
      'Fun and relaxed, although a couple of acts ran well over their five minutes.',
      'Brave performers and a friendly crowd. Good value for a weeknight.',
      'I played my first ever set here and everyone was so supportive.',
      'Hard to hear anything over the noise from the bar at the back.',
      null,
      null,
      'The host kept things moving all night. Great fun.',
      'Some strong acts and some weaker ones, which is what an open mic is about.',
    ],
  },
];
const [jazz, film, comedy, wine] = eventPlans.map((event) => event.id);
const demoFeedbackEvent = eventPlans[5];
const DEMO_FEEDBACK_BOOKING_INDEX = 3;

const events: Prisma.EventCreateManyInput[] = eventPlans.map((plan) => ({
  id: plan.id,
  title: plan.title,
  description: plan.description,
  venue: plan.venue,
  startsAt: plan.startsAt,
  capacity: plan.capacity,
  seatsTaken: plan.booked.reduce((sum, seats) => sum + seats, 0),
}));

const FIRST_NAMES = [
  'Marta',
  'Luca',
  'Sofia',
  'Daniel',
  'Chiara',
  'Tom',
  'Elena',
  'Paolo',
  'Vera',
  'Oscar',
  'Giulia',
  'Ben',
  'Irene',
  'Marco',
  'Laura',
  'Felix',
  'Anna',
  'Pietro',
  'Clara',
  'Hugo',
];
const LAST_NAMES = [
  'Rinaldi',
  'Bianchi',
  'Hart',
  'Moretti',
  'Keller',
  'Conti',
  'Brooks',
  'Ferri',
  'Lang',
  'Marino',
  'Novak',
  'Greco',
  'Walsh',
  'Ricci',
  'Berg',
  'Costa',
  'Fontana',
];

interface BookingPlan {
  event: EventPlan;
  index: number;
  name: string;
  email: string;
  seats: number;
  status: 'CONFIRMED' | 'CANCELLED';
  rating: number | null;
  comment: string | null;
  idempotencyKey: string;
  feedbackToken: string;
  createdAt: Date;
}

let guestNumber = 0;
const bookingPlans: BookingPlan[] = eventPlans.flatMap((event) => {
  const entries = [
    ...event.booked.map((seats) => ({ seats, status: 'CONFIRMED' as const })),
    ...(event.cancelled ?? []).map((seats) => ({ seats, status: 'CANCELLED' as const })),
  ];
  return entries.map(({ seats, status }, index) => {
    guestNumber += 1;
    const first = FIRST_NAMES[guestNumber % FIRST_NAMES.length] ?? 'Guest';
    const last = LAST_NAMES[(guestNumber * 7) % LAST_NAMES.length] ?? 'Guest';
    // Bookings came in over the days before the event, two days ahead at the latest.
    const latest = Math.min(now.getTime() - HOUR_MS, event.startsAt.getTime() - 2 * DAY_MS);
    const createdAt = new Date(latest - (index % 6) * DAY_MS - (guestNumber % 9) * HOUR_MS);
    const isDemoBooking = event === demoFeedbackEvent && index === DEMO_FEEDBACK_BOOKING_INDEX;
    return {
      event,
      index,
      name: `${first} ${last}`,
      email: `${first}.${last}${guestNumber}@example.com`.toLowerCase(),
      seats,
      status,
      rating: event.ratings?.[index] ?? null,
      comment: event.comments?.[index] ?? null,
      idempotencyKey: randomUUID(),
      feedbackToken: isDemoBooking ? DEMO_FEEDBACK_TOKEN : randomUUID(),
      createdAt,
    };
  });
});

/**
 * The messages of a seeded booking, as the API would have scheduled them when it was made.
 * What was due has gone out. A cancelled booking kept only its confirmation.
 */
function messagesFor(booking: { id: string; seq: number }, plan: BookingPlan) {
  const context = {
    guestName: plan.name,
    seats: plan.seats,
    eventTitle: plan.event.title,
    eventStartsAt: plan.event.startsAt,
    venue: plan.event.venue,
    reference: bookingReference(booking.seq),
    feedbackToken: plan.feedbackToken,
  };
  return planMessages(plan.event.startsAt, plan.createdAt).map(
    ({ kind, scheduledFor }): Prisma.MessageCreateManyInput => {
      const cancelled = plan.status === 'CANCELLED' && kind !== 'CONFIRMATION';
      const sent = !cancelled && scheduledFor <= now;
      return {
        bookingId: booking.id,
        kind,
        recipient: plan.email,
        ...renderMessage(kind, context, messageSettings),
        scheduledFor,
        status: cancelled ? 'CANCELLED' : sent ? 'SENT' : 'SCHEDULED',
        sentAt: sent ? scheduledFor : null,
        createdAt: plan.createdAt,
      };
    },
  );
}

/** Feedback arrives some hours after the request, which goes out the day after the event. */
function feedbackFor(booking: { id: string }, plan: BookingPlan): Prisma.FeedbackCreateManyInput[] {
  if (plan.rating === null) return [];
  const askedAt = plan.event.startsAt.getTime() + DAY_MS;
  const answeredAt = Math.min(askedAt + (1 + (plan.index % 20)) * HOUR_MS, now.getTime());
  return [
    {
      bookingId: booking.id,
      rating: plan.rating,
      comment: plan.comment,
      createdAt: new Date(answeredAt),
    },
  ];
}

type WorkOrderPlan = Pick<
  Prisma.WorkOrderCreateManyInput,
  'title' | 'description' | 'priority' | 'status' | 'eventId' | 'assigneeId'
>;

const workOrderPlans: WorkOrderPlan[] = [
  {
    title: 'Confirm sound engineer',
    description: 'Two monitors and a grand piano mic.',
    priority: 'HIGH',
    status: 'IN_PROGRESS',
    eventId: jazz,
    assigneeId: sam.id,
  },
  {
    title: 'Print the seating plan',
    description: 'A3, four copies for the ushers.',
    priority: 'MEDIUM',
    status: 'OPEN',
    eventId: film,
    assigneeId: robin.id,
  },
  {
    title: 'Order a spare projector lamp',
    description: 'The current one is past 1800 hours.',
    priority: 'HIGH',
    status: 'OPEN',
    eventId: film,
  },
  {
    title: 'Stage lighting check',
    description: 'Focus the front spots on the mic stand.',
    priority: 'MEDIUM',
    status: 'DONE',
    eventId: comedy,
    assigneeId: sam.id,
  },
  {
    title: 'Arrange glassware rental',
    description: 'Sixty tasting glasses, delivered the day before.',
    priority: 'LOW',
    status: 'OPEN',
    eventId: wine,
    assigneeId: sam.id,
  },
  {
    title: 'Fix the emergency exit sign',
    description: 'Main Hall, left door: the light flickers.',
    priority: 'HIGH',
    status: 'IN_PROGRESS',
    assigneeId: robin.id,
  },
  {
    title: 'Deep clean the foyer carpets',
    description: 'Postponed until after the season.',
    priority: 'LOW',
    status: 'CANCELLED',
  },
  {
    title: 'Update the fire safety checklist',
    description: 'Extinguisher positions changed in the refit.',
    priority: 'MEDIUM',
    status: 'DONE',
    assigneeId: robin.id,
  },
];

const workOrders: Prisma.WorkOrderCreateManyInput[] = workOrderPlans.map((plan, index) => {
  // Oldest first, a day apart, so "newest first" has something to show.
  const createdAt = daysFromNow(index - workOrderPlans.length);
  return { ...plan, createdById: admin.id, createdAt, updatedAt: createdAt };
});

try {
  if (await prisma.user.findUnique({ where: { email: admin.email } })) {
    console.log('Demo data already present, nothing to do.');
  } else {
    const users: Prisma.UserCreateManyInput[] = [
      { ...admin, role: 'ADMIN', passwordHash: await hashPassword('demo-admin-1') },
      { ...sam, role: 'STAFF', passwordHash: await hashPassword('demo-staff-1') },
      { ...robin, role: 'STAFF', passwordHash: await hashPassword('demo-staff-2') },
    ];
    const counts = await prisma.$transaction(async (tx) => {
      await tx.user.createMany({ data: users });
      await tx.event.createMany({ data: events });
      const created = await tx.booking.createManyAndReturn({
        data: bookingPlans.map((plan) => ({
          eventId: plan.event.id,
          name: plan.name,
          email: plan.email,
          seats: plan.seats,
          status: plan.status,
          idempotencyKey: plan.idempotencyKey,
          payloadHash: 'seed',
          feedbackToken: plan.feedbackToken,
          createdAt: plan.createdAt,
        })),
        select: { id: true, seq: true, idempotencyKey: true },
      });
      const byKey = new Map(created.map((booking) => [booking.idempotencyKey, booking]));
      const rows = bookingPlans.map((plan) => {
        const booking = byKey.get(plan.idempotencyKey);
        if (!booking) throw new Error('A seeded booking was not created.');
        return { booking, plan };
      });

      const messages = rows.flatMap(({ booking, plan }) => messagesFor(booking, plan));
      const feedback = rows.flatMap(({ booking, plan }) => feedbackFor(booking, plan));
      await tx.message.createMany({ data: messages });
      await tx.feedback.createMany({ data: feedback });
      await tx.workOrder.createMany({ data: workOrders });
      return { bookings: created.length, messages: messages.length, feedback: feedback.length };
    });
    console.log(
      `Seeded ${users.length} users, ${events.length} events, ${counts.bookings} bookings, ` +
        `${counts.messages} messages, ${counts.feedback} ratings, ${workOrders.length} work orders.`,
    );
  }
} finally {
  await prisma.$disconnect();
}
