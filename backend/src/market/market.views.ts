import type { MediaView } from '../media/media.types.js';

export interface ListingView {
  id: string;
  kind: 'OFFER' | 'REQUEST';
  category: string;
  title: string;
  description: string;
  priceCents: number;
  /** "usdc" on SOLANA_USDC listings (priced in USDC cents). */
  currency: string;
  /** SOLANA_USDC listings are bought in the Solana dApp Store build, paid through Larea's escrow. */
  paymentRail: 'STRIPE' | 'SOLANA_USDC';
  status: string;
  owner: { id: string; displayName: string };
  /** The caller owns this listing. */
  mine: boolean;
  images: MediaView[];
  /** Approximate for everyone: the centre of a ~150 m cell, never the exact spot. */
  location: { lat: number; lng: number; approximate: true };
  /** From the caller's fix to the approximate location, rounded to 50 m; null without a fix. */
  distanceM: number | null;
  /** Owner only: open offers waiting for an answer. */
  offerCount?: number;
  createdAt: string;
  expiresAt: string;
}

export interface OfferView {
  id: string;
  listingId: string;
  listing: { id: string; title: string; kind: 'OFFER' | 'REQUEST'; priceCents: number; currency: string; thumbUrl: string | null; status: string };
  offerer: { id: string; displayName: string };
  amountCents: number;
  note: string | null;
  status: string;
  expiresAt: string;
  respondedAt: string | null;
  orderId: string | null;
  createdAt: string;
}

export interface ListingDetailView extends ListingView {
  /** The caller's own latest offer on this listing. */
  myOffer: OfferView | null;
  /** Owner only: offers still waiting for an answer. */
  offers?: OfferView[];
}

export interface MarketConfigView {
  enabled: boolean;
  payments: boolean;
  testMode: boolean;
  currency: string;
  radiusM: number;
  feePercent: number;
  feeMinCents: number;
  minPriceCents: number;
  maxPriceCents: number;
  maxImages: number;
}

export interface MarketMeView {
  payoutsEnabled: boolean;
  listings: ListingView[];
  offersMade: OfferView[];
  offersReceived: OfferView[];
  orders: import('./orders.service.js').OrderView[];
}
