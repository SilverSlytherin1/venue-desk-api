import { describe, expect, it } from 'vitest';
import { expectProblem } from './support/fixtures.js';
import { useTestApp } from './support/test-app.js';

describe('application shell', () => {
  const t = useTestApp();

  it('reports healthy when the database answers', async () => {
    const response = await t.api.get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('answers an unknown route with a NOT_FOUND problem', async () => {
    const response = await t.api.get('/no-such-route');

    expectProblem(response, 404, 'NOT_FOUND');
    expect(response.body).toMatchObject({ instance: '/api/v1/no-such-route' });
  });

  it('answers with a problem outside the API prefix too, even for a target like "//"', async () => {
    const unknown = await t.root.get('//?x');
    const unreadable = await t.root
      .post('//')
      .set('Content-Type', 'application/json')
      .send('{"email": ');

    for (const [response, status, code] of [
      [unknown, 404, 'NOT_FOUND'],
      [unreadable, 400, 'VALIDATION_FAILED'],
    ] as const) {
      expect(response.status).toBe(status);
      expect(response.headers['content-type']).toMatch(/^application\/problem\+json/);
      expect(response.body).toMatchObject({ status, code, instance: '//' });
    }
  });

  it('answers a body that is not JSON with a VALIDATION_FAILED problem', async () => {
    const response = await t.api
      .post('/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": ');

    expectProblem(response, 400, 'VALIDATION_FAILED');
  });

  it('allows browser calls from the configured origin only', async () => {
    const allowed = await t.api.get('/health').set('Origin', 'http://localhost:4200');
    const other = await t.api.get('/health').set('Origin', 'https://elsewhere.example');

    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:4200');
    expect(other.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('publishes an OpenAPI document with every endpoint of the contract and who needs a token', async () => {
    const response = await t.root.get('/docs-json');
    const { paths, components } = response.body as {
      paths: Record<string, Record<string, { security?: unknown[] }>>;
      components: { schemas: Record<string, unknown> };
    };

    const operations = Object.entries(paths).flatMap(([path, methods]) =>
      Object.entries(methods).map(
        ([method, operation]) =>
          `${method.toUpperCase()} ${path}${operation.security ? ' (token)' : ''}`,
      ),
    );

    expect(operations.sort()).toEqual(
      [
        'GET /api/v1/health',
        'POST /api/v1/auth/login',
        'GET /api/v1/auth/me (token)',
        'GET /api/v1/users (token)',
        'GET /api/v1/events',
        'GET /api/v1/events/{id}',
        'POST /api/v1/events (token)',
        'POST /api/v1/events/{id}/bookings',
        'GET /api/v1/events/{id}/bookings (token)',
        'POST /api/v1/bookings/{id}/cancel (token)',
        'GET /api/v1/work-orders (token)',
        'GET /api/v1/work-orders/{id} (token)',
        'POST /api/v1/work-orders (token)',
        'PATCH /api/v1/work-orders/{id} (token)',
        'POST /api/v1/work-orders/{id}/transitions (token)',
      ].sort(),
    );
    // A property whose type the generator could not see ends up as a schema called "Object".
    expect(Object.keys(components.schemas)).not.toContain('Object');
    expect(Object.keys(components.schemas)).toEqual(
      expect.arrayContaining(['User', 'UserRef', 'Event', 'Booking', 'WorkOrder', 'Problem']),
    );
  });
});
