export const MessageKind = {
  CONFIRMATION: 'CONFIRMATION',
  REMINDER: 'REMINDER',
  FEEDBACK_REQUEST: 'FEEDBACK_REQUEST',
} as const;
export type MessageKind = (typeof MessageKind)[keyof typeof MessageKind];

export const MessageStatus = {
  SCHEDULED: 'SCHEDULED',
  SENT: 'SENT',
  CANCELLED: 'CANCELLED',
} as const;
export type MessageStatus = (typeof MessageStatus)[keyof typeof MessageStatus];
