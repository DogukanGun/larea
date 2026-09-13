import { describe, expect, it } from 'vitest';
import { haversineMeters } from '../venues/geo.js';
import { bboxDeltas, roundDistance, snapPosition } from './market-geo.js';

describe('snapPosition', () => {
  it('moves the point to its cell centre, never more than about 110 m away, deterministically', () => {
    const exact = { lat: 48.137438, lng: 11.575533 };
    const a = snapPosition(exact);
    const b = snapPosition(exact);
    expect(a).toEqual(b);
    expect(haversineMeters(exact, a)).toBeLessThan(110);
    expect(a.geohash).toHaveLength(7);
  });

  it('gives neighbours in the same cell the same public position', () => {
    const one = snapPosition({ lat: 48.13740, lng: 11.57550 });
    const two = snapPosition({ lat: 48.13742, lng: 11.57553 });
    expect(one).toEqual(two);
  });
});

describe('helpers', () => {
  it('rounds distances to 50 m and never below 50', () => {
    expect(roundDistance(12)).toBe(50);
    expect(roundDistance(174)).toBe(150);
    expect(roundDistance(176)).toBe(200);
  });

  it('computes bounding box deltas', () => {
    const { dLat, dLng } = bboxDeltas(48, 2000);
    expect(dLat).toBeCloseTo(0.01797, 4);
    expect(dLng).toBeGreaterThan(dLat);
  });
});
