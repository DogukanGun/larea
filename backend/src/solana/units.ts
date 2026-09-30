/** USDC, SKR and our devnet stand-ins all use 6 decimals. */
export const TOKEN_DECIMALS = 6;

/** "2.5" → 2_500_000n for 6 decimals, exactly (no floating point); null when not a plain decimal. */
export function parseUnits(text: string, decimals = TOKEN_DECIMALS): bigint | null {
  const match = /^(\d{1,12})(?:\.(\d+))?$/.exec(text.trim());
  if (!match || (match[2]?.length ?? 0) > decimals) return null;
  return BigInt(match[1]) * 10n ** BigInt(decimals) + BigInt((match[2] ?? '').padEnd(decimals, '0') || '0');
}

/** 2_500_000n → "2.5" for 6 decimals. */
export function formatUnits(base: bigint, decimals = TOKEN_DECIMALS): string {
  const unit = 10n ** BigInt(decimals);
  const fraction = (base % unit).toString().padStart(decimals, '0').replace(/0+$/, '');
  return fraction ? `${base / unit}.${fraction}` : `${base / unit}`;
}
