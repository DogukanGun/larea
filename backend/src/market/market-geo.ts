import { decodeGeohash, encodeGeohash } from '../venues/discovery/geohash.js';
import type { LatLng } from '../venues/geo.js';

/** Geohash precision whose cells are about 150 m x 150 m: coarse enough to hide a front door. */
export const SNAP_PRECISION = 7;

/** The position everyone else sees: the centre of the caller's ~150 m cell (deterministic, no jitter to average away). */
export function snapPosition(point: LatLng): { geohash: string; lat: number; lng: number } {
  const geohash = encodeGeohash(point.lat, point.lng, SNAP_PRECISION);
  const cell = decodeGeohash(geohash);
  return { geohash, lat: cell.lat, lng: cell.lng };
}

/** Degree deltas for a bounding box of radiusM around lat. */
export function bboxDeltas(lat: number, radiusM: number): { dLat: number; dLng: number } {
  return { dLat: radiusM / 111_320, dLng: radiusM / (111_320 * Math.max(0.1, Math.cos((lat * Math.PI) / 180))) };
}

/** Distances shown to others are rounded so they cannot triangulate the exact spot. */
export function roundDistance(meters: number, step = 50): number {
  return Math.max(step, Math.round(meters / step) * step);
}
