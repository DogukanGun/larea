import { describe, expect, it } from 'vitest';
import { stampSvg, truncateBytes, utcDay } from './stamps.service.js';

describe('stamp helpers', () => {
  it('cuts names to 32 bytes without splitting characters', () => {
    expect(truncateBytes('Café Größenwahn · 12', 32)).toBe('Café Größenwahn · 12');
    const long = truncateBytes('Staatsbibliothek zu Berlin – Haus Unter den Linden · 3', 32);
    expect(Buffer.byteLength(long)).toBeLessThanOrEqual(32);
    expect(truncateBytes('ééééééééééééééééé', 5)).toBe('éé');
  });

  it('uses the UTC day', () => {
    expect(utcDay(new Date('2026-09-30T23:30:00-02:00'))).toBe('2026-10-01');
  });

  it('escapes place names in the picture', () => {
    expect(stampSvg('<Bar & "Grill">', '2026-09-30', 2)).toContain('&#60;Bar &#38; &#34;Grill&#34;&#62;');
  });
});
