import { Module } from '@nestjs/common';
import { MessageDispatcher } from './message-dispatcher.js';
import { DemoMessageSender, MessageSender } from './message-sender.js';
import { MessagesController } from './messages.controller.js';
import { MessagesService } from './messages.service.js';

@Module({
  controllers: [MessagesController],
  providers: [
    MessagesService,
    MessageDispatcher,
    // The one place to plug in a real email provider.
    { provide: MessageSender, useClass: DemoMessageSender },
  ],
  exports: [MessagesService],
})
export class MessagesModule {}
