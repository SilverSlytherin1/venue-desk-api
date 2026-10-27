import { Injectable, Logger } from '@nestjs/common';
import type { MessageKind } from './message.enums.js';

export interface OutgoingMessage {
  id: string;
  kind: MessageKind;
  recipient: string;
  subject: string;
  body: string;
}

/**
 * Port to whatever delivers messages. The dispatcher claims a row before it calls `send`, so a
 * sender is never handed the same message twice. Throwing puts the message back in the queue.
 */
export abstract class MessageSender {
  abstract send(message: OutgoingMessage): Promise<void>;
}

/**
 * The only sender of the demo: it delivers nothing. The message row, with its subject, body and
 * send time, is the record of what would have gone out, and the staff area shows it.
 * Logs ids and kinds only: addresses and bodies are personal data and stay out of the logs.
 */
@Injectable()
export class DemoMessageSender extends MessageSender {
  private readonly logger = new Logger(DemoMessageSender.name);

  send(message: OutgoingMessage): Promise<void> {
    this.logger.log(`Recorded ${message.kind} message ${message.id}, not delivered (demo sender)`);
    return Promise.resolve();
  }
}
