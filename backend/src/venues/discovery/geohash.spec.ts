import { describe, expect, it } from 'vitest';
import { haversineMeters } from '../geo.js';
import { decodeGeohash, encodeGeohash, geohashCellRadiusM, geohashCellsWithin, geohashNeighbors } from './geohash.js';

describe('geohash', () => {
  it('matches the reference encoding', () => {
    expect(encodeGeohash(57.64911, 10.40744, 11)).toBe('u4pruydqqvj');
    expect(encodeGeohash(52.5219, 13.4132, 6)).toMatch(/^u33/);
  });

  it('decodes to the cell centre with the right size', () => {
    const cell = decodeGeohash(encodeGeohash(52.5219, 13.4132, 6));
    expect(Math.abs(cell.lat - 52.5219)).toBeLessThan(cell.latErr);
    expect(Math.abs(cell.lng - 13.4132)).toBeLessThan(cell.lngErr);
    expect(cell.latErr * 2 * 111_320).toBeCloseTo(611, -1); // ~0.6 km tall
  });

  it('lists eight distinct neighbours that surround the cell', () => {
    const hash = encodeGeohash(52.5219, 13.4132, 6);
    const neighbours = geohashNeighbors(hash);
    expect(neighbours).toHaveLength(8);
    expect(neighbours).not.toContain(hash);
    const c = decodeGeohash(hash);
    expect(neighbours).toContain(encodeGeohash(c.lat + 2 * c.latErr, c.lng, 6));
    expect(neighbours).toContain(encodeGeohash(c.lat, c.lng - 2 * c.lngErr, 6));
  });

  it('lists every cell whose centre lies within a radius, own cell included', () => {
    const point = { lat: 48.1374, lng: 11.5755 };
    const own = encodeGeohash(point.lat, point.lng, 6);
    expect(geohashCellsWithin(point.lat, point.lng, 0)).toEqual([own]);

    const near = geohashCellsWithin(point.lat, point.lng, 1500);
    expect(near).toContain(own);
    expect(new Set(near).size).toBe(near.length);
    // A 1.5 km circle covers roughly fourteen 0.8 km x 0.6 km cells (cells are ~0.5 km² at 48° N).
    expect(near.length).toBeGreaterThanOrEqual(10);
    expect(near.length).toBeLessThanOrEqual(18);
    for (const h of near) expect(haversineMeters(point, decodeGeohash(h))).toBeLessThanOrEqual(1500);
    for (const h of geohashNeighbors(own)) expect(near).toContain(h);

    // City scale: about pi * 12^2 km^2 / 0.5 km^2 per cell.
    const city = geohashCellsWithin(point.lat, point.lng, 12_000);
    expect(city.length).toBeGreaterThan(850);
    expect(city.length).toBeLessThan(950);
    expect(geohashCellRadiusM(decodeGeohash(own))).toBeCloseTo(510, -2); // half the cell diagonal
  });
});
