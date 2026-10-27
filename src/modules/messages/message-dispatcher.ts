import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MessagesService } from './messages.service.js';

/**
 * Runs the dispatcher every minute. Registered only when SCHEDULER_ENABLED is true (see
 * app.module.ts). The e2e suite turns it off and calls MessagesService.dispatchDue itself.
 */
@Injectable()
export class MessageDispatcher {
  private readonly logger = new Logger(MessageDispatcher.name);

  constructor(private readonly messages: MessagesService) {}

  @Cron(CronExpression.EVERY_MINUTE, { name: 'dispatch-messages', waitForCompletion: true })
  async run(): Promise<void> {
    try {
      const sent = await this.messages.dispatchDue();
      if (sent > 0) {
        this.logger.log(`Dispatched ${sent} due ${sent === 1 ? 'message' : 'messages'}`);
      }
    } catch (error) {
      // The next run tries again: a due message stays SCHEDULED until it is claimed.
      this.logger.error(
        'Message dispatch failed',
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
