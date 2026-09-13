import { describe, expect, it } from 'vitest';
import { computeFee } from './fees.js';

describe('computeFee', () => {
  it('takes the percentage with a minimum', () => {
    expect(computeFee(1500, 10, 50)).toEqual({ amountCents: 1500, feeCents: 150, payoutCents: 1350 });
    expect(computeFee(300, 10, 50)).toEqual({ amountCents: 300, feeCents: 50, payoutCents: 250 });
    expect(computeFee(333, 10, 50)).toEqual({ amountCents: 333, feeCents: 50, payoutCents: 283 });
  });

  it('never leaves the payee with nothing', () => {
    expect(computeFee(100, 10, 200)).toEqual({ amountCents: 100, feeCents: 99, payoutCents: 1 });
    expect(computeFee(2000, 0, 0)).toEqual({ amountCents: 2000, feeCents: 0, payoutCents: 2000 });
  });
});
