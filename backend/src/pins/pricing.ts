import type { PinTier } from '../generated/prisma/enums.js';
import { haversineMeters, type LatLng } from '../venues/geo.js';

export interface TierInfo {
  tier: PinTier;
  /** The store product; the same id on the App Store and Google Play (consumable / one-time). */
  productId: string;
  /** US dollars as shown in the stores' USD price point; also the USDC amount on the Solana build. */
  priceUsd: string;
  durationHours: number;
}

export const PIN_PRODUCT_PREFIX = 'com.dogukangundogan.larea.pin.';

export const PIN_TIERS: Record<PinTier, TierInfo> = {
  NEARBY: { tier: 'NEARBY', productId: `${PIN_PRODUCT_PREFIX}nearby`, priceUsd: '3.99', durationHours: 24 },
  CITY: { tier: 'CITY', productId: `${PIN_PRODUCT_PREFIX}city`, priceUsd: '10.99', durationHours: 72 },
  COUNTRY: { tier: 'COUNTRY', productId: `${PIN_PRODUCT_PREFIX}country`, priceUsd: '29.99', durationHours: 72 },
  WORLD: { tier: 'WORLD', productId: `${PIN_PRODUCT_PREFIX}world`, priceUsd: '39.99', durationHours: 168 },
};

/** What a reverse geocoder says about a point; null fields mean unknown (open sea, no data). */
export interface PlaceAdmin {
  /** Stable identity of the city-level area, e.g. "relation/62422" — compared, never shown. */
  cityKey: string | null;
  cityName: string | null;
  /** ISO 3166-1 alpha-2, lower case. */
  countryCode: string | null;
}

/**
 * The buyer's position decides the price: close by is cheapest, the same city next, then the same
 * country, and anywhere else costs the most. Unknown areas never match, so they price as further away.
 */
export function tierFor(buyer: LatLng, target: LatLng, nearbyRadiusM: number, buyerAdmin: PlaceAdmin | null, targetAdmin: PlaceAdmin | null): PinTier {
  if (haversineMeters(buyer, target) <= nearbyRadiusM) return 'NEARBY';
  if (buyerAdmin?.cityKey && buyerAdmin.cityKey === targetAdmin?.cityKey) return 'CITY';
  if (buyerAdmin?.countryCode && buyerAdmin.countryCode === targetAdmin?.countryCode) return 'COUNTRY';
  return 'WORLD';
}

export function tierForProduct(productId: string): TierInfo | null {
  return Object.values(PIN_TIERS).find((t) => t.productId === productId) ?? null;
}
