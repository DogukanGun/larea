import { describe, expect, it } from 'vitest';
import { categoryForTags } from './categories.js';
import { FakeOverpassClient } from '../../testing/fake-overpass.client.js';
import { buildOverpassQuery, overpassBbox, overpassLimit, overpassTimeoutSec, parseOverpassResponse } from './overpass.client.js';

describe('categoryForTags', () => {
  it('maps OSM tags to chat categories', () => {
    expect(categoryForTags({ amenity: 'library' })).toBe('library');
    expect(categoryForTags({ railway: 'station', public_transport: 'station' })).toBe('station');
    expect(categoryForTags({ tourism: 'museum' })).toBe('museum');
    expect(categoryForTags({ amenity: 'theatre' })).toBe('museum');
    expect(categoryForTags({ shop: 'mall' })).toBe('mall');
    expect(categoryForTags({ leisure: 'garden' })).toBe('park');
    expect(categoryForTags({ amenity: 'cafe' })).toBe('cafe');
    expect(categoryForTags({ amenity: 'bar' })).toBeNull();
  });
});

describe('buildOverpassQuery', () => {
  it('asks for named elements of every selector inside the box around the point', () => {
    const bbox = overpassBbox(52.5219, 13.4132, 1500);
    const [south, west, north, east] = bbox.split(',').map(Number);
    expect(north - south).toBeCloseTo(0.02695, 4); // ~1.5 km each way
    expect(east - west).toBeCloseTo(0.04429, 4);
    expect((north + south) / 2).toBeCloseTo(52.5219, 5);
    expect((east + west) / 2).toBeCloseTo(13.4132, 5);
    const q = buildOverpassQuery(52.5219, 13.4132, 1500);
    expect(q.startsWith(`[out:json][timeout:40][bbox:${bbox}];(`)).toBe(true);
    expect(q).toContain(`nwr["amenity"="library"]["name"](${bbox});`);
    expect(q).toContain('nwr["place"="square"]["name"]');
    expect(q).not.toContain('"cafe"');
    expect(q).not.toContain('"park"');
    expect(q.endsWith('out center 400;')).toBe(true);
    expect(buildOverpassQuery(52.5219, 13.4132, 1500, 'parks')).toContain('nwr["leisure"="park"]["name"]');
    expect(buildOverpassQuery(52.5219, 13.4132, 700, 'cafes')).toContain(`nwr["amenity"="cafe"]["name"](${overpassBbox(52.5219, 13.4132, 700)})`);
    expect(overpassBbox(89.9995, 179.9999, 1500).split(',').slice(2)).toEqual(['90.000000', '180.000000']); // clamped at the edges
  });

  it('gives a city-wide query more time and room for results', () => {
    expect(overpassTimeoutSec(1500)).toBe(40);
    expect(overpassTimeoutSec(4243)).toBe(90);
    expect(overpassTimeoutSec(12_000)).toBe(180);
    expect(overpassLimit(700)).toBe(400);
    expect(overpassLimit(1500)).toBe(400);
    expect(overpassLimit(4243)).toBe(3201);
    expect(overpassLimit(12_685)).toBe(6000);
    const city = buildOverpassQuery(48.1374, 11.5755, 12_685);
    expect(city.startsWith('[out:json][timeout:180][bbox:')).toBe(true);
    expect(city.endsWith('out center 6000;')).toBe(true);
  });
});

describe('parseOverpassResponse', () => {
  const sample = {
    elements: [
      { type: 'node', id: 266540876, lat: 52.5316059, lon: 13.3986959, tags: { amenity: 'library', name: 'Bezirkszentralbibliothek Philipp Schaeffer', 'addr:street': 'Brunnenstraße', 'addr:housenumber': '181' } },
      { type: 'node', id: 29494301, lat: 52.5153554, lon: 13.4181732, tags: { railway: 'station', name: 'Jannowitzbrücke' } },
      { type: 'way', id: 4711, center: { lat: 52.52, lon: 13.41 }, tags: { place: 'square', name: 'Alexanderplatz' } },
      { type: 'node', id: 1, lat: 52.5, lon: 13.4, tags: { amenity: 'library' } }, // unnamed → skipped
      { type: 'node', id: 2, lat: 52.5, lon: 13.4, tags: { amenity: 'bar', name: 'Nope' } }, // unsupported tag → skipped
      { type: 'node', id: 266540876, lat: 52.5316059, lon: 13.3986959, tags: { amenity: 'library', name: 'dup' } }, // duplicate ref
    ],
  };

  it('keeps named, supported places with a coordinate and an address when present', () => {
    const places = parseOverpassResponse(sample);
    expect(places.map((p) => p.sourceRef)).toEqual(['node/266540876', 'node/29494301', 'way/4711']);
    expect(places[0]).toMatchObject({ name: 'Bezirkszentralbibliothek Philipp Schaeffer', category: 'library', address: 'Brunnenstraße 181' });
    expect(places[1].address).toBeNull();
    expect(places[2]).toMatchObject({ category: 'square', lat: 52.52, lng: 13.41 });
  });

  it('tolerates garbage', () => {
    expect(parseOverpassResponse(null)).toEqual([]);
    expect(parseOverpassResponse({ elements: 'x' })).toEqual([]);
  });
});

describe('FakeOverpassClient', () => {
  it('returns places relative to the query point and counts calls', async () => {
    const fake = new FakeOverpassClient();
    const places = await fake.search(52.5219, 13.4132, 1000);
    expect(places.map((p) => p.category)).toEqual(['library', 'station']);
    const cafes = await fake.search(52.5219, 13.4132, 700, 'cafes');
    expect(cafes.map((p) => p.category)).toEqual(['cafe']);
    const parks = await fake.search(52.5219, 13.4132, 1500, 'parks');
    expect(parks.map((p) => p.category)).toEqual(['park']);
    expect(fake.calls).toBe(3);
  });
});
