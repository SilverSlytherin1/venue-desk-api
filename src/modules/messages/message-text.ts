import { firstName } from '../bookings/guest-name.js';
import { MessageKind } from './message.enums.js';

/** What a message says about its booking. Captured when the message is created. */
export interface MessageContext {
  guestName: string;
  seats: number;
  eventTitle: string;
  eventStartsAt: Date;
  venue: string;
  reference: string;
  feedbackToken: string;
}

export interface MessageSettings {
  /** IANA zone of the venue: guests read times on the venue's clock. */
  timeZone: string;
  /** Web app address, without a trailing slash. */
  webUrl: string;
}

export interface MessageText {
  subject: string;
  body: string;
}

/** Subject and plain text body of one message. Pure, so every wording is unit tested. */
export function renderMessage(
  kind: MessageKind,
  context: MessageContext,
  settings: MessageSettings,
): MessageText {
  const greeting = `Hello ${firstName(context.guestName)},`;
  const when = formatWhen(context.eventStartsAt, settings.timeZone);

  switch (kind) {
    case MessageKind.CONFIRMATION:
      return {
        subject: `Your seats for ${context.eventTitle}`,
        body: lines(
          greeting,
          '',
          `your booking is confirmed: ${seatCount(context.seats)} for ${context.eventTitle}.`,
          '',
          `When: ${when}`,
          `Where: ${context.venue}`,
          `Booking reference: ${context.reference}`,
          '',
          'See you there.',
        ),
      };
    case MessageKind.REMINDER:
      return {
        subject: `Tomorrow: ${context.eventTitle}`,
        body: lines(
          greeting,
          '',
          `a quick reminder: ${context.eventTitle} starts ${when} at ${context.venue}.`,
          '',
          `Booking reference: ${context.reference}`,
          '',
          'See you tomorrow.',
        ),
      };
    case MessageKind.FEEDBACK_REQUEST:
      return {
        subject: `How was ${context.eventTitle}?`,
        body: lines(
          greeting,
          '',
          `thank you for coming to ${context.eventTitle}.`,
          'Would you rate your evening from 1 to 5? It takes less than a minute:',
          `${settings.webUrl}/feedback/${context.feedbackToken}`,
        ),
      };
  }
}

/** "Tuesday 17 November 2026 at 20:00", on the clock of the given zone. */
export function formatWhen(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((candidate) => candidate.type === type)?.value ?? '';

  return `${part('weekday')} ${part('day')} ${part('month')} ${part('year')} at ${part('hour')}:${part('minute')}`;
}

function seatCount(seats: number): string {
  return seats === 1 ? '1 seat' : `${seats} seats`;
}

function lines(...text: string[]): string {
  return text.join('\n');
}
