import { randomUUID } from 'node:crypto';
import type { Response } from 'supertest';
import { expect } from 'vitest';
import type { ErrorCode } from '../../src/common/errors/domain-errors.js';
import type { Event, Prisma, User, WorkOrder } from '../../src/generated/prisma/client.js';
import type { Role } from '../../src/common/auth/role.js';
import { hashPassword } from '../../src/modules/auth/password.js';
import type { TestApp } from './test-app.js';

const DAY_MS = 24 * 60 * 60 * 1000;
export const daysFromNow = (days: number): Date => new Date(Date.now() + days * DAY_MS);

export const PASSWORD = 'correct-horse-battery';
/** Hashed once: argon2 is slow on purpose and every test user can share the result. */
const passwordHash = await hashPassword(PASSWORD);

let sequence = 0;

export function createUser(
  t: TestApp,
  role: Role,
  overrides: Partial<Prisma.UserCreateInput> = {},
): Promise<User> {
  sequence += 1;
  return t.prisma.user.create({
    data: {
      name: `${role} ${sequence}`,
      email: `user${sequence}@venuedesk.test`,
      role,
      passwordHash,
      ...overrides,
    },
  });
}

export interface SignedInUser {
  user: User;
  /** Ready for `.set(auth)`. */
  auth: { Authorization: string };
}

/** Creates a user and logs in through the real endpoint. */
export async function signIn(t: TestApp, role: Role): Promise<SignedInUser> {
  const user = await createUser(t, role);
  const response = await t.api
    .post('/auth/login')
    .send({ email: user.email, password: PASSWORD })
    .expect(200);
  const { accessToken } = response.body as { accessToken: string };
  return { user, auth: { Authorization: `Bearer ${accessToken}` } };
}

/** A bookable event: it starts next week and has ten seats, unless the test says otherwise. */
export function createEvent(
  t: TestApp,
  overrides: Partial<Prisma.EventCreateInput> = {},
): Promise<Event> {
  return t.prisma.event.create({
    data: {
      title: 'Test event',
      description: 'Created by a test',
      venue: 'Main Hall',
      startsAt: daysFromNow(7),
      capacity: 10,
      ...overrides,
    },
  });
}

export function createWorkOrder(
  t: TestApp,
  createdBy: User,
  overrides: Partial<Prisma.WorkOrderUncheckedCreateInput> = {},
): Promise<WorkOrder> {
  return t.prisma.workOrder.create({
    data: {
      title: 'Test work order',
      description: 'Created by a test',
      priority: 'MEDIUM',
      createdById: createdBy.id,
      ...overrides,
    },
  });
}

/** Sends a booking request with a fresh idempotency key, unless one is given. */
export function book(
  t: TestApp,
  eventId: string,
  seats: number,
  idempotencyKey: string = randomUUID(),
): Promise<Response> {
  return t.api
    .post(`/events/${eventId}/bookings`)
    .set('Idempotency-Key', idempotencyKey)
    .send({ name: 'Ada Lovelace', email: 'ada@example.com', seats });
}

/** Asserts the RFC 7807 envelope of the contract, not just the status code. */
export function expectProblem(response: Response, status: number, code: ErrorCode): void {
  expect(response.status).toBe(status);
  expect(response.headers['content-type']).toMatch(/^application\/problem\+json/);
  expect(response.body).toMatchObject({
    type: `https://venue-desk.dev/problems/${code.toLowerCase().replaceAll('_', '-')}`,
    title: expect.any(String),
    status,
    code,
    detail: expect.any(String),
    instance: expect.stringMatching(/^\/api\/v1\//),
  });
}
