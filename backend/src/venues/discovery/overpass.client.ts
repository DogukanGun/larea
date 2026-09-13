import { Logger } from '@nestjs/common';
import { type PlaceCategory, TAG_SELECTORS, categoryForTags } from './categories.js';

export interface DiscoveredPlace {
  /** OSM element reference, e.g. `node/266540876`. */
  sourceRef: string;
  name: string;
  category: PlaceCategory;
  lat: number;
  lng: number;
  address: string | null;
}

export type SearchKind = 'landmarks' | 'parks' | 'cafes';

const KIND_CATEGORIES: Record<SearchKind, readonly string[]> = {
  landmarks: ['library', 'station', 'square', 'university', 'stadium', 'museum', 'mall'],
  parks: ['park'],
  cafes: ['cafe'],
};

export interface OverpassClient {
  search(lat: number, lng: number, radiusM: number, kind?: SearchKind): Promise<DiscoveredPlace[]>;
}

export const OVERPASS_CLIENT = Symbol('OVERPASS_CLIENT');

export const OVERPASS_TIMEOUT_SEC = 40;

/** Wide areas (a whole city) need more server time than a neighbourhood. */
export function overpassTimeoutSec(radiusM: number): number {
  if (radiusM <= 3_000) return OVERPASS_TIMEOUT_SEC;
  return radiusM <= 8_000 ? 90 : 180;
}

/** Result cap that grows with the area (400 for 1.5 km) so a city-wide query is not truncated. */
export function overpassLimit(radiusM: number): number {
  return Math.min(6_000, Math.max(400, Math.round(400 * (radiusM / 1_500) ** 2)));
}

/** The bounding box that contains the circle, as Overpass wants it: south,west,north,east. */
export function overpassBbox(lat: number, lng: number, radiusM: number): string {
  const dLat = radiusM / 111_320;
  const dLng = radiusM / (111_320 * Math.max(0.1, Math.cos((lat * Math.PI) / 180)));
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  return [clamp(lat - dLat, -90, 90), clamp(lng - dLng, -180, 180), clamp(lat + dLat, -90, 90), clamp(lng + dLng, -180, 180)]
    .map((v) => v.toFixed(6))
    .join(',');
}

/**
 * Bounding-box queries use the spatial index directly and stay fast at city scale, whereas
 * `around` has to measure every way and relation; the corners outside the circle just yield a
 * few extra real places that the API filters by distance anyway.
 */
export function buildOverpassQuery(lat: number, lng: number, radiusM: number, kind: SearchKind = 'landmarks', limit = overpassLimit(radiusM)): string {
  const bbox = overpassBbox(lat, lng, radiusM);
  const selectors = TAG_SELECTORS.filter((s) => KIND_CATEGORIES[kind].includes(s.category));
  const clauses = selectors.map((s) => `nwr["${s.key}"="${s.value}"]["name"](${bbox});`).join('');
  return `[out:json][timeout:${overpassTimeoutSec(radiusM)}][bbox:${bbox}];(${clauses});out center ${limit};`;
}

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export function parseOverpassResponse(body: unknown): DiscoveredPlace[] {
  const elements = ((body as { elements?: OverpassElement[] })?.elements ?? []) as OverpassElement[];
  const seen = new Set<string>();
  const places: DiscoveredPlace[] = [];
  for (const el of elements) {
    const tags = el.tags ?? {};
    const name = tags.name?.trim();
    const category = categoryForTags(tags);
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (!name || !category || typeof lat !== 'number' || typeof lng !== 'number') continue;
    const sourceRef = `${el.type}/${el.id}`;
    if (seen.has(sourceRef)) continue;
    seen.add(sourceRef);
    const street = tags['addr:street']?.trim();
    const number = tags['addr:housenumber']?.trim();
    places.push({
      sourceRef,
      name: name.slice(0, 80),
      category,
      lat,
      lng,
      address: street ? [street, number].filter(Boolean).join(' ') : null,
    });
  }
  return places;
}

export class HttpOverpassClient implements OverpassClient {
  private readonly logger = new Logger(HttpOverpassClient.name);

  constructor(
    private readonly options: { url: string; fallbackUrls?: string[]; contact: string; fetchImpl?: typeof fetch },
  ) {}

  async search(lat: number, lng: number, radiusM: number, kind: SearchKind = 'landmarks'): Promise<DiscoveredPlace[]> {
    const fetchImpl = this.options.fetchImpl ?? fetch;
    const body = new URLSearchParams({ data: buildOverpassQuery(lat, lng, radiusM, kind) });
    const urls = [this.options.url, ...(this.options.fallbackUrls ?? [])];
    let lastError: unknown;
    for (let attempt = 0; attempt < Math.min(3, urls.length * 2); attempt++) {
      const url = urls[attempt % urls.length];
      try {
        const res = await fetchImpl(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': `larea/0.1 (${this.options.contact})` },
          body,
          signal: AbortSignal.timeout((overpassTimeoutSec(radiusM) + 5) * 1000),
        });
        if (res.status === 429 || res.status === 504) {
          // Public instance is busy: back off and try again.
          await new Promise((r) => setTimeout(r, 2_000 * (attempt + 1)));
          throw new Error(`Overpass HTTP ${res.status}`);
        }
        if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
        return parseOverpassResponse(await res.json());
      } catch (err) {
        lastError = err;
        const cause = (err as { cause?: { code?: string; message?: string } }).cause;
        this.logger.warn(
          { attempt, url, reason: err instanceof Error ? err.message : String(err), cause: cause?.code ?? cause?.message },
          'overpass query failed',
        );
      }
    }
    throw lastError instanceof Error ? lastError : new Error('overpass failed');
  }
}
