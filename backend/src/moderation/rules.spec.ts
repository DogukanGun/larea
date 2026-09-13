import { describe, expect, it } from 'vitest';
import { detectSignals, normalizeText } from './rules.js';

describe('normalizeText', () => {
  it('strips control characters and collapses whitespace', () => {
    expect(normalizeText('  hi  there \n\n friend\u0007 ')).toBe('hi there friend');
  });
});

describe('detectSignals', () => {
  it('finds contact details and addresses', () => {
    expect(detectSignals('call me +49 170 1234567')).toContain('phone_number');
    expect(detectSignals('mail anna@example.com')).toContain('email');
    expect(detectSignals('see www.example.com/x')).toContain('url');
    expect(detectSignals('she lives at Torstraße 12')).toContain('street_address');
    expect(detectSignals('12 Baker Street')).toContain('street_address');
    expect(detectSignals('find me @anna_k')).toContain('social_handle');
  });

  it('stays quiet on ordinary chat', () => {
    expect(detectSignals('Anyone want to get food?')).toEqual([]);
    expect(detectSignals('call me at 8')).toEqual([]);
    expect(detectSignals('I am at Main Square')).toEqual([]);
  });
});
