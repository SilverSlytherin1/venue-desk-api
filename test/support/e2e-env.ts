/**
 * The e2e suite truncates every table between tests, so it never reads DATABASE_URL: it has
 * a database of its own, created on first run.
 */
export const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ??
  'postgresql://venue_desk:venue_desk@localhost:5433/venue_desk_e2e';

export const e2eEnv = {
  NODE_ENV: 'test',
  DATABASE_URL: E2E_DATABASE_URL,
  JWT_SECRET: 'e2e-only-secret-0123456789abcdef0123456789',
  JWT_TTL_SECONDS: '3600',
  CORS_ORIGIN: 'http://localhost:4200',
  // High enough that the suite never trips them, the concurrency tests included. The limits
  // themselves are exercised in rate-limits.e2e-spec.ts.
  LOGIN_RATE_LIMIT: '1000',
  BOOKING_RATE_LIMIT: '1000',
};
