/** Crockford base32: no I, L, O or U, so a code survives being read aloud or typed back. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CODE_LENGTH = 6;
const BITS_PER_CHAR = 5;
const MASK = 2 ** (CODE_LENGTH * BITS_PER_CHAR) - 1;

/**
 * Turns a booking sequence number into its public reference, for example "VD-7K2Q9X".
 *
 * Each step below (multiplying by an odd constant, xor with a right shift) is a bijection
 * on 30-bit integers. Sequential numbers therefore map to distinct codes that do not look
 * sequential, with no uniqueness check and no retry. Unique for the first 2^30 bookings.
 */
export function bookingReference(seq: number): string {
  let mixed = Math.imul(seq, 0x2545f491) & MASK;
  mixed ^= mixed >>> 15;
  mixed = Math.imul(mixed, 0x1b873593) & MASK;
  mixed ^= mixed >>> 13;

  let code = '';
  for (let shift = (CODE_LENGTH - 1) * BITS_PER_CHAR; shift >= 0; shift -= BITS_PER_CHAR) {
    code += ALPHABET.charAt((mixed >>> shift) & 0b11111);
  }
  return `VD-${code}`;
}
