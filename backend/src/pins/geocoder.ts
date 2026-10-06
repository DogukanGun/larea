import type { PlaceAdmin } from './pricing.js';

/** Reverse geocoding: which city and country a point lies in. */
export interface Geocoder {
  /** Throws GeocoderUnavailableError when the service cannot answer right now. */
  reverse(lat: number, lng: number): Promise<PlaceAdmin>;
}

export const GEOCODER = Symbol('GEOCODER');

export class GeocoderUnavailableError extends Error {}

interface NominatimReverse {
  osm_type?: string;
  osm_id?: number;
  name?: string;
  error?: string;
  address?: { city?: string; town?: string; village?: string; municipality?: string; county?: string; country_code?: string };
}

/** The city-level area Nominatim resolves at zoom 10; its OSM identity is what two points must share. */
export function parseNominatimReverse(body: NominatimReverse): PlaceAdmin {
  if (body.error) return { cityKey: null, cityName: null, countryCode: null };
  const a = body.address ?? {};
  return {
    cityKey: body.osm_type && body.osm_id ? `${body.osm_type}/${body.osm_id}` : null,
    cityName: a.city ?? a.town ?? a.village ?? a.municipality ?? a.county ?? body.name ?? null,
    countryCode: a.country_code?.toLowerCase() ?? null,
  };
}

/**
 * OpenStreetMap Nominatim. The public instance allows one request per second with an identifying
 * User-Agent, so calls are spaced out here and the caller caches results per area.
 */
export class NominatimGeocoder implements Geocoder {
  private queue: Promise<unknown> = Promise.resolve();
  private lastCallAt = 0;

  constructor(private readonly options: { url: string; contact: string; minIntervalMs?: number; fetchImpl?: typeof fetch }) {}

  reverse(lat: number, lng: number): Promise<PlaceAdmin> {
    const run = this.queue.then(() => this.call(lat, lng));
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async call(lat: number, lng: number): Promise<PlaceAdmin> {
    const wait = this.lastCallAt + (this.options.minIntervalMs ?? 1100) - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this.lastCallAt = Date.now();
    const url = new URL('/reverse', this.options.url);
    url.search = new URLSearchParams({ format: 'jsonv2', lat: String(lat), lon: String(lng), zoom: '10', addressdetails: '1' }).toString();
    let res: Response;
    try {
      res = await (this.options.fetchImpl ?? fetch)(url, {
        headers: { 'User-Agent': `larea/0.1 (${this.options.contact})`, 'Accept-Language': 'en' },
        signal: AbortSignal.timeout(8000),
      });
    } catch (err) {
      throw new GeocoderUnavailableError(`nominatim unreachable: ${(err as Error).message}`);
    }
    if (!res.ok) throw new GeocoderUnavailableError(`nominatim ${res.status}`);
    return parseNominatimReverse((await res.json()) as NominatimReverse);
  }
}
