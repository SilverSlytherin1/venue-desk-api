/**
 * Demo data, documented in the README. Runs once: if the demo admin already exists the script
 * leaves the database alone, so it is safe to run on every start of the compose stack.
 */
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { type Prisma, PrismaClient } from '../src/generated/prisma/client.js';
import { hashPassword } from '../src/modules/auth/password.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const daysFromNow = (days: number): Date => new Date(Date.now() + days * DAY_MS);

/** Events are dated relative to the day of seeding, so the demo always has upcoming ones. */
function eveningIn(days: number, hour: number, minute = 0): Date {
  const date = daysFromNow(days);
  date.setUTCHours(hour, minute, 0, 0);
  return date;
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required to seed the database.');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

const admin = { id: randomUUID(), name: 'Alex Admin', email: 'admin@venuedesk.test' };
const sam = { id: randomUUID(), name: 'Sam Staff', email: 'sam@venuedesk.test' };
const robin = { id: randomUUID(), name: 'Robin Staff', email: 'robin@venuedesk.test' };

/** `booked` lists the seats of each existing booking, so the counter and the bookings agree. */
const eventPlans = [
  {
    id: randomUUID(),
    title: 'Autumn Jazz Night',
    description: 'Three sets from the house quintet, doors open one hour before.',
    venue: 'Main Hall',
    startsAt: eveningIn(21, 20),
    capacity: 200,
    booked: [2, 4, 3],
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
];
const [jazz, film, comedy, wine] = eventPlans.map((event) => event.id);

const events: Prisma.EventCreateManyInput[] = eventPlans.map(({ booked, ...event }) => ({
  ...event,
  seatsTaken: booked.reduce((sum, seats) => sum + seats, 0),
}));

const bookings: Prisma.BookingCreateManyInput[] = eventPlans
  .flatMap((event) => event.booked.map((seats) => ({ eventId: event.id, seats })))
  .map((booking, index) => ({
    ...booking,
    name: `Guest ${index + 1}`,
    email: `guest${index + 1}@example.com`,
    idempotencyKey: randomUUID(),
    payloadHash: 'seed',
  }));

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
    await prisma.$transaction([
      prisma.user.createMany({ data: users }),
      prisma.event.createMany({ data: events }),
      prisma.booking.createMany({ data: bookings }),
      prisma.workOrder.createMany({ data: workOrders }),
    ]);
    console.log(
      `Seeded ${users.length} users, ${events.length} events, ${bookings.length} bookings, ${workOrders.length} work orders.`,
    );
  }
} finally {
  await prisma.$disconnect();
}
