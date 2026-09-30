import { describe, expect, it } from 'vitest';
import { levelFor, levelName, nextLevelAt } from './levels.js';

describe('loyalty levels', () => {
  const thresholds = [5, 15, 40];

  it('maps stamps to levels', () => {
    expect([0, 1, 4, 5, 14, 15, 39, 40, 400].map((n) => levelFor(n, thresholds))).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4]);
    expect(levelName(2)).toBe('Regular');
  });

  it('knows what comes next', () => {
    expect(nextLevelAt(0, thresholds)).toBe(1);
    expect(nextLevelAt(1, thresholds)).toBe(5);
    expect(nextLevelAt(3, thresholds)).toBe(40);
    expect(nextLevelAt(4, thresholds)).toBeNull();
  });
});
