import type { IncidentKind } from '../generated/prisma/enums.js';

export interface StrikeInput {
  /** Violations in the rolling window, including the one just recorded. */
  recentSeverities: number[];
  latestSeverity: number;
}

export interface StrikeOutcome {
  action: 'none' | 'mute' | 'suspend';
  muteHours?: number;
  incident?: IncidentKind;
}

export const STRIKE_WINDOW_DAYS = 7;

/**
 * Severity 3 mutes for a day immediately and goes to moderators. Otherwise the sum of
 * severities over the last 7 days escalates: 3 → 1 h mute, 6 → 24 h mute, 9 → suspension.
 */
export function evaluateStrikes({ recentSeverities, latestSeverity }: StrikeInput): StrikeOutcome {
  const total = recentSeverities.reduce((a, b) => a + b, 0);
  if (total >= 9) return { action: 'suspend', incident: 'STRIKE_THRESHOLD' };
  if (latestSeverity >= 3) return { action: 'mute', muteHours: 24, incident: 'SEVERE_CONTENT' };
  if (total >= 6) return { action: 'mute', muteHours: 24 };
  if (total >= 3) return { action: 'mute', muteHours: 1 };
  return { action: 'none' };
}
