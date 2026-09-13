import { describe, expect, it } from 'vitest';
import { TABLES, assertTransition, listingCan, offerCan, orderCan } from './state-machine.js';

describe('state machines', () => {
  it('allows the documented transitions and nothing else', () => {
    expect(listingCan('ACTIVE', 'RESERVED')).toBe(true);
    expect(listingCan('RESERVED', 'SOLD')).toBe(true);
    expect(listingCan('SOLD', 'ACTIVE')).toBe(false);
    expect(offerCan('PENDING', 'ACCEPTED')).toBe(true);
    expect(offerCan('ACCEPTED', 'DECLINED')).toBe(false);
    expect(orderCan('AWAITING_PAYMENT', 'PAID')).toBe(true);
    expect(orderCan('PAID', 'COMPLETED')).toBe(true);
    expect(orderCan('COMPLETED', 'REFUNDED')).toBe(false);
    expect(orderCan('CANCELLED', 'REFUNDED')).toBe(true); // a payment that lands after cancelling is refunded
  });

  it('every terminal state has no way out', () => {
    for (const state of ['SOLD', 'CANCELLED', 'EXPIRED', 'REMOVED'] as const) expect(TABLES.LISTING[state]).toEqual([]);
    for (const state of ['ACCEPTED', 'DECLINED', 'WITHDRAWN', 'EXPIRED'] as const) expect(TABLES.OFFER[state]).toEqual([]);
    expect(TABLES.ORDER.REFUNDED).toEqual([]);
  });

  it('assertTransition throws the API conflict', () => {
    expect(() => assertTransition(TABLES.ORDER, 'PAID', 'PAID', 'order')).toThrow(/cannot become/);
    expect(() => assertTransition(TABLES.ORDER, 'PAID', 'COMPLETED', 'order')).not.toThrow();
  });
});
