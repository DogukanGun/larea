export interface FeeSplit {
  amountCents: number;
  feeCents: number;
  payoutCents: number;
}

/** Platform fee: a percentage with a floor; the payee always keeps at least one cent. */
export function computeFee(amountCents: number, feePercent: number, feeMinCents: number): FeeSplit {
  const raw = Math.round((amountCents * feePercent) / 100);
  const feeCents = Math.min(Math.max(raw, feeMinCents), Math.max(0, amountCents - 1));
  return { amountCents, feeCents, payoutCents: amountCents - feeCents };
}
