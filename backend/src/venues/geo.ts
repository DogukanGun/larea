export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_M = 6_371_008.8;

/** Great-circle distance in metres. */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export type JoinVerdict = 'ok' | 'imprecise' | 'too_far';

/** Joining is strict: the fix must be precise and inside the join radius. */
export function joinVerdict(
  distanceM: number,
  accuracyM: number,
  limits: { joinRadiusM: number; maxAccuracyM: number },
): JoinVerdict {
  if (accuracyM > limits.maxAccuracyM) return 'imprecise';
  return distanceM <= limits.joinRadiusM ? 'ok' : 'too_far';
}

export type FixState = 'eligible' | 'weak_gps' | 'outside';

/**
 * Staying uses hysteresis and the fix's error circle:
 * - eligible: precise fix inside the (larger) leave radius
 * - weak_gps: imprecise, but the error circle still overlaps the venue
 * - outside: the whole error circle is beyond the leave radius
 */
export function classifyFix(
  distanceM: number,
  accuracyM: number,
  limits: { leaveRadiusM: number; maxAccuracyM: number },
): FixState {
  if (distanceM <= limits.leaveRadiusM && accuracyM <= limits.maxAccuracyM) return 'eligible';
  if (distanceM - accuracyM <= limits.leaveRadiusM) return 'weak_gps';
  return 'outside';
}

/**
 * Speed implied by two fixes after discounting both error radii. Returns 0 when the
 * movement is explainable by GPS error alone.
 */
export function impliedSpeedMps(
  prev: LatLng & { accuracy: number; at: number },
  next: LatLng & { accuracy: number; at: number },
): number {
  const excess = haversineMeters(prev, next) - (prev.accuracy + next.accuracy);
  if (excess <= 0) return 0;
  const seconds = Math.max(1, (next.at - prev.at) / 1000);
  return excess / seconds;
}
