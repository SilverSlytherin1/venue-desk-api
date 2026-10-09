import { describe, expect, it } from 'vitest';
import { DEMO_JWT_SECRET, validateEnv } from './env.js';

const valid = {
  DATABASE_URL: 'postgresql://user:secret@localhost:5433/venue_desk',
  JWT_SECRET: 'x'.repeat(32),
  CORS_ORIGIN: 'http://localhost:4200',
};

describe('validateEnv', () => {
  it('accepts a minimal environment and fills in the defaults', () => {
    expect(validateEnv(valid)).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3000,
      JWT_TTL_SECONDS: 3600,
      DEMO_MODE: false,
      CORS_ORIGIN: ['http://localhost:4200'],
      TRUST_PROXY_HOPS: 0,
      LOGIN_RATE_LIMIT: 5,
      BOOKING_RATE_LIMIT: 10,
    });
  });

  it('turns numeric variables into numbers and the origin list into trimmed entries', () => {
    const env = validateEnv({
      ...valid,
      PORT: '8080',
      TRUST_PROXY_HOPS: '1',
      CORS_ORIGIN: 'https://app.example.com , http://localhost:4200,',
    });

    expect(env.PORT).toBe(8080);
    expect(env.TRUST_PROXY_HOPS).toBe(1);
    expect(env.CORS_ORIGIN).toEqual(['https://app.example.com', 'http://localhost:4200']);
  });

  it('refuses to start without the required variables, naming all of them at once', () => {
    expect(() => validateEnv({})).toThrow(
      /DATABASE_URL must be a postgresql:\/\/ URL[\s\S]*JWT_SECRET[\s\S]*CORS_ORIGIN/,
    );
  });

  it.each([
    ['a short JWT secret', { JWT_SECRET: 'too-short' }, /JWT_SECRET must be longer/],
    ['a non-numeric port', { PORT: 'http' }, /PORT must be an integer/],
    ['a database URL of another kind', { DATABASE_URL: 'mysql://localhost/db' }, /DATABASE_URL/],
    ['an unknown NODE_ENV', { NODE_ENV: 'staging' }, /NODE_ENV must be one of/],
    ['an origin with a path', { CORS_ORIGIN: 'https://app.example.com/' }, /CORS_ORIGIN must list/],
    ['an empty origin list', { CORS_ORIGIN: ' , ' }, /CORS_ORIGIN should not be empty/],
    ['a negative proxy count', { TRUST_PROXY_HOPS: '-1' }, /TRUST_PROXY_HOPS must not be less/],
    ['a zero rate limit', { LOGIN_RATE_LIMIT: '0' }, /LOGIN_RATE_LIMIT must not be less than 1/],
    ['a rate limit that disables itself', { BOOKING_RATE_LIMIT: '1000000' }, /BOOKING_RATE_LIMIT/],
    ['a demo flag that is not a boolean', { DEMO_MODE: 'yes' }, /DEMO_MODE must be a boolean/],
  ])('refuses %s', (_case, override, message) => {
    expect(() => validateEnv({ ...valid, ...override })).toThrow(message);
  });

  describe('the published demo secret', () => {
    const demo = { ...valid, JWT_SECRET: DEMO_JWT_SECRET };

    it('is refused in production', () => {
      expect(() => validateEnv({ ...demo, NODE_ENV: 'production' })).toThrow(
        /JWT_SECRET is the published demo secret/,
      );
    });

    it('is accepted in production only with the explicit demo flag', () => {
      const env = validateEnv({ ...demo, NODE_ENV: 'production', DEMO_MODE: 'true' });

      expect(env.DEMO_MODE).toBe(true);
    });

    it('is accepted outside production, where .env.example uses it', () => {
      expect(validateEnv({ ...demo, NODE_ENV: 'development' }).JWT_SECRET).toBe(DEMO_JWT_SECRET);
    });
  });
});
