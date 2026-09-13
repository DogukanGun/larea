import { describe, expect, it } from 'vitest';
import { evaluateStrikes } from './strike-policy.js';

describe('evaluateStrikes', () => {
  it('does nothing for a first mild violation', () => {
    expect(evaluateStrikes({ recentSeverities: [1], latestSeverity: 1 })).toEqual({ action: 'none' });
  });

  it('mutes for an hour at a total of 3', () => {
    expect(evaluateStrikes({ recentSeverities: [1, 2], latestSeverity: 2 })).toEqual({ action: 'mute', muteHours: 1 });
  });

  it('mutes for a day at a total of 6', () => {
    expect(evaluateStrikes({ recentSeverities: [2, 2, 2], latestSeverity: 2 })).toEqual({ action: 'mute', muteHours: 24 });
  });

  it('mutes for a day and opens an incident on a severe violation', () => {
    expect(evaluateStrikes({ recentSeverities: [3], latestSeverity: 3 })).toEqual({ action: 'mute', muteHours: 24, incident: 'SEVERE_CONTENT' });
  });

  it('suspends at a total of 9', () => {
    expect(evaluateStrikes({ recentSeverities: [3, 3, 3], latestSeverity: 3 })).toEqual({ action: 'suspend', incident: 'STRIKE_THRESHOLD' });
  });
});
