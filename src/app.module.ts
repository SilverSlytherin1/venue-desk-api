import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { RolesGuard } from './common/auth/roles.guard.js';
import { ProblemFilter } from './common/errors/problem.filter.js';
import { RateLimitModule } from './common/http/rate-limit.js';
import { createValidationPipe } from './common/http/validation.pipe.js';
import { type Env, validateEnv } from './config/env.js';
import { DatabaseModule } from './database/database.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { JwtAuthGuard } from './modules/auth/jwt-auth.guard.js';
import { BookingsModule } from './modules/bookings/bookings.module.js';
import { DashboardModule } from './modules/dashboard/dashboard.module.js';
import { EventsModule } from './modules/events/events.module.js';
import { FeedbackModule } from './modules/feedback/feedback.module.js';
import { HealthController } from './modules/health/health.controller.js';
import { MessagesModule } from './modules/messages/messages.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { WorkOrdersModule } from './modules/work-orders/work-orders.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    DatabaseModule,
    RateLimitModule,
    // Cron jobs (the message dispatcher) run only when SCHEDULER_ENABLED is true.
    ScheduleModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        cronJobs: config.get('SCHEDULER_ENABLED', { infer: true }),
        intervals: false,
        timeouts: false,
      }),
    }),
    AuthModule,
    UsersModule,
    EventsModule,
    BookingsModule,
    MessagesModule,
    FeedbackModule,
    DashboardModule,
    WorkOrdersModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_PIPE, useFactory: createValidationPipe },
    { provide: APP_FILTER, useClass: ProblemFilter },
    // Everything that applies to every route is registered here, in one place. Guards run in
    // this order: authentication first, then roles. A route is open only if it says @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
