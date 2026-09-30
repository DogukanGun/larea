import { describe, expect, it } from 'vitest';
import { formatUnits, parseUnits } from './units.js';

describe('token amounts', () => {
  it('parses decimals exactly', () => {
    expect(parseUnits('2.5')).toBe(2_500_000n);
    expect(parseUnits('0.000001')).toBe(1n);
    expect(parseUnits('10')).toBe(10_000_000n);
    expect(parseUnits('0.0000001')).toBeNull();
    expect(parseUnits('-1')).toBeNull();
    expect(parseUnits('1e3')).toBeNull();
  });

  it('formats without trailing zeros', () => {
    expect(formatUnits(2_500_000n)).toBe('2.5');
    expect(formatUnits(10_000_000n)).toBe('10');
    expect(formatUnits(1n)).toBe('0.000001');
  });
});
