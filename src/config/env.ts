import { plainToInstance, Transform, Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsBoolean,
  IsIn,
  IsInt,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

/** Published in docker-compose.yml and .env.example, so it protects nothing. */
export const DEMO_JWT_SECRET = 'demo-only-jwt-secret-do-not-use-in-production';

interface Raw {
  value: unknown;
}

const toBoolean = ({ value }: Raw): unknown =>
  value === 'true' ? true : value === 'false' ? false : value;

const toList = ({ value }: Raw): unknown =>
  typeof value === 'string'
    ? value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    : value;

export class Env {
  @IsIn(['development', 'test', 'production'])
  NODE_ENV: 'development' | 'test' | 'production' = 'development';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65_535)
  PORT = 3000;

  @Matches(/^postgres(ql)?:\/\/\S+$/, { message: 'DATABASE_URL must be a postgresql:// URL' })
  DATABASE_URL!: string;

  @IsString()
  @MinLength(32)
  JWT_SECRET!: string;

  @Type(() => Number)
  @IsInt()
  @Min(60)
  JWT_TTL_SECONDS = 3600;

  /** Deliberate opt-in to the published demo configuration, see validateEnv(). */
  @Transform(toBoolean)
  @IsBoolean()
  DEMO_MODE = false;

  /** Origins allowed to call the API from a browser. Comma separated in the environment. */
  @Transform(toList)
  @ArrayNotEmpty()
  @Matches(/^https?:\/\/[^\s/]+$/, {
    each: true,
    message: 'CORS_ORIGIN must list origins such as https://app.example.com, without a path',
  })
  CORS_ORIGIN!: string[];

  /**
   * Number of reverse proxies in front of the API. Their X-Forwarded-For header is trusted
   * to find the client IP that rate limits are counted against. With 0 the header is
   * ignored, so a client cannot dodge a limit by forging it.
   */
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10)
  TRUST_PROXY_HOPS = 0;

  /** Login attempts allowed per client IP per minute. */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  LOGIN_RATE_LIMIT = 5;

  /** Booking requests allowed per client IP per minute. */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  BOOKING_RATE_LIMIT = 10;
}

/** Throws at startup, listing every problem at once, so a misconfigured process never serves traffic. */
export function validateEnv(raw: Record<string, unknown>): Env {
  const env = plainToInstance(Env, raw);
  const problems = validateSync(env).flatMap((error) => Object.values(error.constraints ?? {}));

  // The demo secret is public. Production may only start with it when asked to, which is
  // what the compose demo does, so that a real deployment cannot inherit it by accident.
  if (env.NODE_ENV === 'production' && env.JWT_SECRET === DEMO_JWT_SECRET && !env.DEMO_MODE) {
    problems.push(
      'JWT_SECRET is the published demo secret: set your own, or DEMO_MODE=true to run the demo',
    );
  }

  if (problems.length > 0) {
    throw new Error(`Invalid environment configuration:\n- ${problems.join('\n- ')}`);
  }
  return env;
}
