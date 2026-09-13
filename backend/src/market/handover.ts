import { randomInt, timingSafeEqual } from 'node:crypto';

export const HANDOVER_CODE_LENGTH = 6;
export const HANDOVER_MAX_ATTEMPTS = 5;
export const HANDOVER_LOCK_MS = 60 * 60 * 1000;

/** Six digits the payer shows at the handover; the payee types it to release the money. */
export function generateHandoverCode(): string {
  return String(randomInt(0, 10 ** HANDOVER_CODE_LENGTH)).padStart(HANDOVER_CODE_LENGTH, '0');
}

export function handoverCodesMatch(expected: string, given: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(given.replace(/\D/g, ''));
  return a.length === b.length && timingSafeEqual(a, b);
}
