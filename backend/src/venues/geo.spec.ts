import { describe, expect, it } from 'vitest';
import { classifyFix, haversineMeters, impliedSpeedMps, joinVerdict } from './geo.js';

const limits = { joinRadiusM: 200, leaveRadiusM: 250, maxAccuracyM: 100 };
const alex = { lat: 52.5219, lng: 13.4132 };

describe('haversineMeters', () => {
  it('is zero for the same point and symmetric', () => {
    expect(haversineMeters(alex, alex)).toBe(0);
    const b = { lat: 52.5229, lng: 13.4152 };
    expect(haversineMeters(alex, b)).toBeCloseTo(haversineMeters(b, alex), 6);
  });

  it('matches known distances (1 degree of latitude ≈ 111.2 km)', () => {
    expect(haversineMeters({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(111_195, -2);
    // ~600 m north of Alexanderplatz (seed offset for Central Station)
    expect(haversineMeters(alex, { lat: 52.52729, lng: 13.4132 })).toBeCloseTo(600, -1);
  });
});

describe('joinVerdict', () => {
  it.each([
    [0, 10, 'ok'],
    [200, 100, 'ok'],
    [201, 10, 'too_far'],
    [10, 101, 'imprecise'],
    [500, 500, 'imprecise'],
  ])('distance %d m, accuracy %d m → %s', (d, a, verdict) => {
    expect(joinVerdict(d, a, limits)).toBe(verdict);
  });
});

describe('classifyFix', () => {
  it.each([
    [0, 10, 'eligible'],
    [250, 100, 'eligible'],
    [251, 10, 'weak_gps'],
    [261, 10, 'outside'],
    [240, 150, 'weak_gps'],
    [300, 60, 'weak_gps'],
    [300, 49, 'outside'],
    [1000, 300, 'outside'],
  ])('distance %d m, accuracy %d m → %s', (d, a, state) => {
    expect(classifyFix(d, a, limits)).toBe(state);
  });
});

describe('impliedSpeedMps', () => {
  it('ignores movement explainable by error radii', () => {
    const t = Date.now();
    expect(impliedSpeedMps({ ...alex, accuracy: 50, at: t }, { lat: 52.5225, lng: 13.4132, accuracy: 50, at: t + 1000 })).toBe(0);
  });

  it('flags a teleport', () => {
    const t = Date.now();
    const farAway = { lat: 52.6219, lng: 13.4132, accuracy: 10, at: t + 10_000 }; // ~11 km in 10 s
    expect(impliedSpeedMps({ ...alex, accuracy: 10, at: t }, farAway)).toBeGreaterThan(1000);
  });
});
