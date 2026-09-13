import type { DiscoveredPlace, OverpassClient, SearchKind } from '../venues/discovery/overpass.client.js';

/** Deterministic places around any query point; used in tests and offline development. */
export class FakeOverpassClient implements OverpassClient {
  calls = 0;

  async search(lat: number, lng: number, _radiusM?: number, kind: SearchKind = 'landmarks'): Promise<DiscoveredPlace[]> {
    this.calls++;
    const north = (m: number) => lat + m / 111_320;
    const east = (m: number) => lng + m / (111_320 * Math.cos((lat * Math.PI) / 180));
    const key = `${lat.toFixed(3)}-${lng.toFixed(3)}`;
    if (kind === 'cafes') {
      return [{ sourceRef: `way/fake-cafe-${key}`, name: 'Test Café', category: 'cafe', lat: north(-300), lng, address: 'Corner 5' }];
    }
    if (kind === 'parks') {
      return [{ sourceRef: `relation/fake-park-${key}`, name: 'Test Park', category: 'park', lat: north(400), lng: east(400), address: null }];
    }
    return [
      { sourceRef: `node/fake-lib-${key}`, name: 'Test Library', category: 'library', lat: north(80), lng, address: 'Test Street 1' },
      { sourceRef: `node/fake-station-${key}`, name: 'Test Station', category: 'station', lat, lng: east(900), address: null },
    ];
  }
}
