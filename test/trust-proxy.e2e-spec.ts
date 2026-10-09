import { describe, expect, it, vi } from 'vitest';
import { createUser, expectProblem, PASSWORD } from './support/fixtures.js';
import { useTestApp } from './support/test-app.js';

// Read at import time, like every setting: see rate-limits.e2e-spec.ts.
vi.hoisted(() => {
  process.env.TRUST_PROXY_HOPS = '1';
  process.env.LOGIN_RATE_LIMIT = '2';
});

describe('behind one trusted reverse proxy', () => {
  const t = useTestApp();

  it('counts a rate limit per forwarded client instead of once for the proxy', async () => {
    const user = await createUser(t, 'STAFF');
    const loginFrom = (clientIp: string) =>
      t.api
        .post('/auth/login')
        .set('X-Forwarded-For', clientIp)
        .send({ email: user.email, password: PASSWORD });

    expect((await loginFrom('203.0.113.1')).status).toBe(200);
    expect((await loginFrom('203.0.113.1')).status).toBe(200);
    expectProblem(await loginFrom('203.0.113.1'), 429, 'RATE_LIMITED');

    expect((await loginFrom('203.0.113.2')).status).toBe(200);
  });
});
