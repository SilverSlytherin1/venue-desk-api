import { describe, expect, it } from 'vitest';
import { formatWhen, type MessageContext, renderMessage } from './message-text.js';

const context: MessageContext = {
  guestName: 'Lena Rose Varga',
  seats: 2,
  eventTitle: 'Autumn Jazz Night',
  // 19:00 UTC is 20:00 in Rome in November.
  eventStartsAt: new Date('2026-11-17T19:00:00.000Z'),
  venue: 'Main Hall',
  reference: 'VD-7K2Q9X',
  feedbackToken: '5f0c2a9e-8d1b-4c3e-9a7f-2b6d4e8c1a35',
};
const settings = { timeZone: 'Europe/Rome', webUrl: 'https://venue.example.com' };

describe('renderMessage', () => {
  it('confirms the booking with everything the guest needs on the night', () => {
    expect(renderMessage('CONFIRMATION', context, settings)).toEqual({
      subject: 'Your seats for Autumn Jazz Night',
      body: [
        'Hello Lena,',
        '',
        'your booking is confirmed: 2 seats for Autumn Jazz Night.',
        '',
        'When: Tuesday 17 November 2026 at 20:00',
        'Where: Main Hall',
        'Booking reference: VD-7K2Q9X',
        '',
        'See you there.',
      ].join('\n'),
    });
  });

  it('says "1 seat" for a single seat', () => {
    const { body } = renderMessage('CONFIRMATION', { ...context, seats: 1 }, settings);

    expect(body).toContain('1 seat for Autumn Jazz Night.');
  });

  it('reminds the guest of the time, the place and the reference', () => {
    expect(renderMessage('REMINDER', context, settings)).toEqual({
      subject: 'Tomorrow: Autumn Jazz Night',
      body: [
        'Hello Lena,',
        '',
        'a quick reminder: Autumn Jazz Night starts Tuesday 17 November 2026 at 20:00 at Main Hall.',
        '',
        'Booking reference: VD-7K2Q9X',
        '',
        'See you tomorrow.',
      ].join('\n'),
    });
  });

  it('asks for feedback with a link to the page of this booking', () => {
    const { subject, body } = renderMessage('FEEDBACK_REQUEST', context, settings);

    expect(subject).toBe('How was Autumn Jazz Night?');
    expect(body).toContain('thank you for coming to Autumn Jazz Night.');
    expect(body.split('\n').at(-1)).toBe(
      'https://venue.example.com/feedback/5f0c2a9e-8d1b-4c3e-9a7f-2b6d4e8c1a35',
    );
  });

  it('never writes an em or en dash', () => {
    for (const kind of ['CONFIRMATION', 'REMINDER', 'FEEDBACK_REQUEST'] as const) {
      const { subject, body } = renderMessage(kind, context, settings);
      expect(subject + body).not.toMatch(/[\u2013\u2014]/);
    }
  });
});

describe('formatWhen', () => {
  it('shows the time on the clock of the venue, daylight saving included', () => {
    const summerEvening = new Date('2026-07-01T18:30:00.000Z');

    expect(formatWhen(summerEvening, 'Europe/Rome')).toBe('Wednesday 1 July 2026 at 20:30');
    expect(formatWhen(summerEvening, 'Europe/London')).toBe('Wednesday 1 July 2026 at 19:30');
    expect(formatWhen(summerEvening, 'UTC')).toBe('Wednesday 1 July 2026 at 18:30');
  });

  it('writes midnight as 00:00, on the right day', () => {
    expect(formatWhen(new Date('2026-11-17T23:00:00.000Z'), 'Europe/Rome')).toBe(
      'Wednesday 18 November 2026 at 00:00',
    );
  });
});
