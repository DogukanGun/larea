import { type Geocoder, GeocoderUnavailableError } from '../pins/geocoder.js';
import type { PlaceAdmin } from '../pins/pricing.js';

/**
 * Deterministic areas for tests: a "city" is a 1° x 1° cell and a "country" a 10° x 10° cell,
 * so tests pick the tier by choosing coordinates.
 */
export class FakeGeocoder implements Geocoder {
  calls = 0;
  unavailable = false;

  async reverse(lat: number, lng: number): Promise<PlaceAdmin> {
    this.calls++;
    if (this.unavailable) throw new GeocoderUnavailableError('fake outage');
    return {
      cityKey: `city/${Math.floor(lat)}:${Math.floor(lng)}`,
      cityName: `City ${Math.floor(lat)}:${Math.floor(lng)}`,
      countryCode: `c${Math.floor(lat / 10)}${Math.floor(lng / 10)}`,
    };
  }
}
