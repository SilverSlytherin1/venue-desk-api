/**
 * Domain enums are declared in the domain, not imported from the generated database client,
 * so pure code and its tests do not depend on it. The values mirror the database enums, and
 * the mappers stop compiling if the two ever drift apart.
 */
export const Role = { ADMIN: 'ADMIN', STAFF: 'STAFF' } as const;
export type Role = (typeof Role)[keyof typeof Role];
