import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module.js';
import { BookingsController } from './bookings.controller.js';
import { BookingsService } from './bookings.service.js';

@Module({
  imports: [EventsModule],
  controllers: [BookingsController],
  providers: [BookingsService],
})
export class BookingsModule {}
