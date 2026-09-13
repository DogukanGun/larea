import { haversineMeters } from '../geo.js';

const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

export interface GeohashCell {
  lat: number;
  lng: number;
  /** Half-height and half-width of the cell in degrees. */
  latErr: number;
  lngErr: number;
}

export function encodeGeohash(lat: number, lng: number, precision = 6): string {
  let minLat = -90, maxLat = 90, minLng = -180, maxLng = 180;
  let hash = '';
  let bit = 0, ch = 0, even = true;
  while (hash.length < precision) {
    if (even) {
      const mid = (minLng + maxLng) / 2;
      if (lng >= mid) { ch |= 1 << (4 - bit); minLng = mid; } else maxLng = mid;
    } else {
      const mid = (minLat + maxLat) / 2;
      if (lat >= mid) { ch |= 1 << (4 - bit); minLat = mid; } else maxLat = mid;
    }
    even = !even;
    if (bit < 4) bit++;
    else { hash += BASE32[ch]; bit = 0; ch = 0; }
  }
  return hash;
}

export function decodeGeohash(hash: string): GeohashCell {
  let minLat = -90, maxLat = 90, minLng = -180, maxLng = 180;
  let even = true;
  for (const c of hash) {
    const cd = BASE32.indexOf(c);
    if (cd < 0) throw new Error(`invalid geohash character ${c}`);
    for (let mask = 16; mask > 0; mask >>= 1) {
      if (even) {
        const mid = (minLng + maxLng) / 2;
        if (cd & mask) minLng = mid; else maxLng = mid;
      } else {
        const mid = (minLat + maxLat) / 2;
        if (cd & mask) minLat = mid; else maxLat = mid;
      }
      even = !even;
    }
  }
  return { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2, latErr: (maxLat - minLat) / 2, lngErr: (maxLng - minLng) / 2 };
}

/** The 8 surrounding cells at the same precision. */
export function geohashNeighbors(hash: string): string[] {
  const c = decodeGeohash(hash);
  const out: string[] = [];
  for (const dy of [-1, 0, 1]) {
    for (const dx of [-1, 0, 1]) {
      if (dx === 0 && dy === 0) continue;
      const lat = c.lat + dy * 2 * c.latErr;
      const lng = ((c.lng + dx * 2 * c.lngErr + 540) % 360) - 180;
      if (lat > 90 || lat < -90) continue;
      out.push(encodeGeohash(lat, lng, hash.length));
    }
  }
  return [...new Set(out)];
}

/** Half the diagonal of a cell in metres: no point of the cell is further than this from its centre. */
export function geohashCellRadiusM(cell: GeohashCell): number {
  return haversineMeters(cell, { lat: cell.lat + cell.latErr, lng: cell.lng + cell.lngErr });
}

/**
 * Every cell at the precision whose centre lies within radiusM of the point (the point's own
 * cell is always included). Cells at one precision form a regular grid, so stepping by the
 * cell size from the point's cell lands on the neighbouring centres exactly.
 */
export function geohashCellsWithin(lat: number, lng: number, radiusM: number, precision = 6): string[] {
  const own = encodeGeohash(lat, lng, precision);
  const origin = decodeGeohash(own);
  const latStep = origin.latErr * 2;
  const lngStep = origin.lngErr * 2;
  const rows = Math.ceil(radiusM / 111_320 / latStep) + 1;
  const cols = Math.ceil(radiusM / (111_320 * Math.max(0.1, Math.cos((lat * Math.PI) / 180))) / lngStep) + 1;
  const out = new Set<string>([own]);
  for (let dy = -rows; dy <= rows; dy++) {
    const cellLat = origin.lat + dy * latStep;
    if (cellLat > 90 || cellLat < -90) continue;
    for (let dx = -cols; dx <= cols; dx++) {
      const cellLng = ((origin.lng + dx * lngStep + 540) % 360) - 180;
      if (haversineMeters({ lat, lng }, { lat: cellLat, lng: cellLng }) <= radiusM) out.add(encodeGeohash(cellLat, cellLng, precision));
    }
  }
  return [...out];
}
