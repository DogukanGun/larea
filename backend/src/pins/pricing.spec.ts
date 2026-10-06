import { describe, expect, it } from 'vitest';
import { PIN_TIERS, tierFor, tierForProduct } from './pricing.js';

const munich = { lat: 48.1374, lng: 11.5755 };
const admin = (cityKey: string | null, countryCode: string | null) => ({ cityKey, cityName: null, countryCode });

describe('pin pricing', () => {
  it('prices by distance first, then city, then country', () => {
    const near = { lat: munich.lat + 0.008, lng: munich.lng }; // ~890 m
    const across = { lat: munich.lat + 0.05, lng: munich.lng }; // ~5.6 km
    expect(tierFor(munich, near, 1000, null, null)).toBe('NEARBY');
    expect(tierFor(munich, across, 1000, admin('r/1', 'de'), admin('r/1', 'de'))).toBe('CITY');
    expect(tierFor(munich, across, 1000, admin('r/1', 'de'), admin('r/2', 'de'))).toBe('COUNTRY');
    expect(tierFor(munich, across, 1000, admin('r/1', 'de'), admin('r/3', 'at'))).toBe('WORLD');
  });

  it('treats unknown areas as further away', () => {
    const far = { lat: 10, lng: 10 };
    expect(tierFor(munich, far, 1000, admin(null, null), admin(null, null))).toBe('WORLD');
    expect(tierFor(munich, far, 1000, null, admin('r/1', 'de'))).toBe('WORLD');
  });

  it('maps store products back to tiers', () => {
    expect(tierForProduct(PIN_TIERS.CITY.productId)?.tier).toBe('CITY');
    expect(tierForProduct('com.example.other')).toBeNull();
    expect(PIN_TIERS.NEARBY).toMatchObject({ priceUsd: '3.99', durationHours: 24 });
    expect(PIN_TIERS.WORLD).toMatchObject({ priceUsd: '39.99', durationHours: 168 });
  });
});
