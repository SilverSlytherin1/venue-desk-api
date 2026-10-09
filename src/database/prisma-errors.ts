import { Prisma } from '../generated/prisma/client.js';

/**
 * Name of the foreign key constraint a write violated, or undefined for any other error.
 * Lets a service treat the constraint as the existence check instead of reading first and
 * hoping the row is still there when it writes.
 */
export function violatedForeignKey(error: unknown): string | undefined {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2003') {
    return undefined;
  }
  // Prisma types `meta` as an open record. This is where the pg driver adapter puts the name.
  const meta = error.meta as
    { driverAdapterError?: { cause?: { constraint?: { index?: string } } } } | undefined;
  return meta?.driverAdapterError?.cause?.constraint?.index;
}
