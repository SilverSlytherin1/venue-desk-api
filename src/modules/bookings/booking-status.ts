export const BookingStatus = { CONFIRMED: 'CONFIRMED', CANCELLED: 'CANCELLED' } as const;
export type BookingStatus = (typeof BookingStatus)[keyof typeof BookingStatus];
