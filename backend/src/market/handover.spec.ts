import { describe, expect, it } from 'vitest';
import { generateHandoverCode, handoverCodesMatch } from './handover.js';

describe('handover codes', () => {
  it('are six digits, zero padded', () => {
    for (let i = 0; i < 50; i++) expect(generateHandoverCode()).toMatch(/^\d{6}$/);
  });

  it('compare digits only, in constant time', () => {
    expect(handoverCodesMatch('012345', '012345')).toBe(true);
    expect(handoverCodesMatch('012345', '012 345')).toBe(true);
    expect(handoverCodesMatch('012345', '12345')).toBe(false);
    expect(handoverCodesMatch('012345', '012346')).toBe(false);
  });
});
