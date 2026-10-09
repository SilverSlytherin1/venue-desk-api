import { applyDecorators, type ExecutionContext, SetMetadata, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { minutes, ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import type { Env } from '../../config/env.js';

type RateLimitSetting = 'LOGIN_RATE_LIMIT' | 'BOOKING_RATE_LIMIT';

const RATE_LIMIT_KEY = 'http:rateLimit';

/** Limits a route to the configured number of requests per client IP per minute. */
export const RateLimit = (setting: RateLimitSetting): MethodDecorator =>
  applyDecorators(SetMetadata(RATE_LIMIT_KEY, setting), UseGuards(ThrottlerGuard));

/**
 * One throttler serves every limited route: it reads the limit from the setting the route
 * names with @RateLimit. Counters are kept in memory, per route and per client IP, which is
 * only correct while the API runs as a single instance.
 */
export const RateLimitModule = ThrottlerModule.forRootAsync({
  inject: [ConfigService, Reflector],
  useFactory: (config: ConfigService<Env, true>, reflector: Reflector) => ({
    errorMessage: 'Too many requests. Try again in a minute.',
    throttlers: [
      {
        ttl: minutes(1),
        limit: (context: ExecutionContext) =>
          config.get(reflector.get<RateLimitSetting>(RATE_LIMIT_KEY, context.getHandler()), {
            infer: true,
          }),
      },
    ],
  }),
});
