import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module.js';
import { FeedbackModule } from '../feedback/feedback.module.js';
import { DashboardController } from './dashboard.controller.js';
import { DashboardService } from './dashboard.service.js';

@Module({
  imports: [EventsModule, FeedbackModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
