import { describe, expect, it } from 'vitest';
import { planMessages } from './message-schedule.js';

const HOUR_MS = 60 * 60 * 1000;
const now = new Date('2026-11-02T10:00:00.000Z');
const hoursFromNow = (hours: number): Date => new Date(now.getTime() + hours * HOUR_MS);

describe('planMessages', () => {
  it('confirms now, reminds a day before and asks for feedback a day after', () => {
    const startsAt = hoursFromNow(7 * 24);

    expect(planMessages(startsAt, now)).toEqual([
      { kind: 'CONFIRMATION', scheduledFor: now },
      { kind: 'REMINDER', scheduledFor: hoursFromNow(6 * 24) },
      { kind: 'FEEDBACK_REQUEST', scheduledFor: hoursFromNow(8 * 24) },
    ]);
  });

  it('keeps the reminder when it is due a moment more than an hour from now', () => {
    const startsAt = new Date(hoursFromNow(25).getTime() + 1);

    expect(planMessages(startsAt, now).map((message) => message.kind)).toEqual([
      'CONFIRMATION',
      'REMINDER',
      'FEEDBACK_REQUEST',
    ]);
  });

  it.each([
    ['exactly one hour from now', hoursFromNow(25)],
    ['in half an hour', hoursFromNow(24.5)],
    ['in the past', hoursFromNow(3)],
  ])('drops the reminder when it would be due %s', (_case, startsAt) => {
    expect(planMessages(startsAt, now)).toEqual([
      { kind: 'CONFIRMATION', scheduledFor: now },
      { kind: 'FEEDBACK_REQUEST', scheduledFor: new Date(startsAt.getTime() + 24 * HOUR_MS) },
    ]);
  });

  it('lists the messages in the order they go out', () => {
    const times = planMessages(hoursFromNow(48), now).map((message) =>
      message.scheduledFor.getTime(),
    );

    expect(times).toEqual([...times].sort((a, b) => a - b));
  });
});
