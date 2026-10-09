import { describe, expect, it, vi } from 'vitest';
import { book, createEvent, createUser, expectProblem, PASSWORD } from './support/fixtures.js';
import { useTestApp } from './support/test-app.js';

// Configuration is read when the application module is first imported, so the lower limits
// have to be in place before that. This file gets its own module graph: other specs are not affected.
vi.hoisted(() => {
  process.env.LOGIN_RATE_LIMIT = '3';
  process.env.BOOKING_RATE_LIMIT = '3';
});

describe('rate limits', () => {
  const t = useTestApp();

  it('throttles login after the configured number of attempts per minute', async () => {
    const user = await createUser(t, 'STAFF');
    const attempt = (password: string, forwardedFor: string) =>
      t.api
        .post('/auth/login')
        .set('X-Forwarded-For', forwardedFor)
        .send({ email: user.email, password });

    // A different X-Forwarded-For on every attempt: with no trusted proxy configured it is
    // ignored, so forging it does not buy a fresh allowance.
    for (let i = 0; i < 3; i++) {
      expectProblem(await attempt('wrong-guess', `203.0.113.${i}`), 401, 'INVALID_CREDENTIALS');
    }
    const throttled = await attempt(PASSWORD, '203.0.113.99');

    expectProblem(throttled, 429, 'RATE_LIMITED');
    expect(Number(throttled.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('throttles public booking separately, so a script cannot drain an event', async () => {
    const event = await createEvent(t, { capacity: 100 });

    for (let i = 0; i < 3; i++) {
      expect((await book(t, event.id, 4)).status).toBe(201);
    }
    const throttled = await book(t, event.id, 4);

    expectProblem(throttled, 429, 'RATE_LIMITED');
    expect(Number(throttled.headers['retry-after'])).toBeGreaterThan(0);
    const { seatsTaken } = await t.prisma.event.findUniqueOrThrow({ where: { id: event.id } });
    expect(seatsTaken).toBe(12);
  });
});
