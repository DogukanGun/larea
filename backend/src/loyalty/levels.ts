/** Loyalty at a place, from confirmed check-in stamps (one per day). Level 0 = never checked in. */
export const LEVEL_NAMES = ['None', 'Visitor', 'Regular', 'Local', 'Legend'] as const;
export const VISITOR = 1;
export const REGULAR = 2;
export const LOCAL = 3;
export const LEGEND = 4;

/** `thresholds` are the stamps needed for Regular, Local and Legend (LOYALTY_LEVELS). */
export function levelFor(stamps: number, thresholds: readonly number[]): number {
  if (stamps <= 0) return 0;
  let level = VISITOR;
  thresholds.forEach((at, i) => {
    if (stamps >= at) level = REGULAR + i;
  });
  return level;
}

export function levelName(level: number): string {
  return LEVEL_NAMES[Math.max(0, Math.min(level, LEGEND))];
}

/** Stamps needed for the level after `level`, or null at the top. */
export function nextLevelAt(level: number, thresholds: readonly number[]): number | null {
  if (level <= 0) return 1;
  return thresholds[level - 1] ?? null;
}
