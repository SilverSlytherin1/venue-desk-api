import { MessageKind } from './message.enums.js';

const HOUR_MS = 60 * 60 * 1000;

/** The reminder goes out this long before the event starts. */
export const REMINDER_LEAD_MS = 24 * HOUR_MS;
/** The feedback request goes out this long after the event starts. */
export const FEEDBACK_DELAY_MS = 24 * HOUR_MS;
/**
 * A reminder due this soon after the booking would land next to the confirmation and tell
 * the guest nothing new, so a late booking gets no reminder at all.
 */
export const REMINDER_MIN_NOTICE_MS = HOUR_MS;

export interface PlannedMessage {
  kind: MessageKind;
  scheduledFor: Date;
}

/**
 * The messages that a booking made at `now`, for an event starting at `startsAt`, will receive,
 * in the order they go out. Pure, so the whole rule is unit tested without a clock or a database.
 */
export function planMessages(startsAt: Date, now: Date): PlannedMessage[] {
  const plan: PlannedMessage[] = [{ kind: MessageKind.CONFIRMATION, scheduledFor: now }];

  const reminderAt = new Date(startsAt.getTime() - REMINDER_LEAD_MS);
  if (reminderAt.getTime() - now.getTime() > REMINDER_MIN_NOTICE_MS) {
    plan.push({ kind: MessageKind.REMINDER, scheduledFor: reminderAt });
  }

  plan.push({
    kind: MessageKind.FEEDBACK_REQUEST,
    scheduledFor: new Date(startsAt.getTime() + FEEDBACK_DELAY_MS),
  });
  return plan;
}
