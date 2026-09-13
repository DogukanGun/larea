import { conflict } from '../common/errors.js';

export type ListingState = 'ACTIVE' | 'RESERVED' | 'SOLD' | 'CANCELLED' | 'EXPIRED' | 'REMOVED';
export type OfferState = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'WITHDRAWN' | 'EXPIRED';
export type OrderState = 'AWAITING_PAYMENT' | 'PAID' | 'COMPLETED' | 'CANCELLED' | 'REFUNDED' | 'DISPUTED';

const LISTING: Record<ListingState, ListingState[]> = {
  ACTIVE: ['RESERVED', 'CANCELLED', 'EXPIRED', 'REMOVED', 'SOLD'],
  RESERVED: ['ACTIVE', 'SOLD', 'REMOVED'],
  SOLD: [],
  CANCELLED: [],
  EXPIRED: [],
  REMOVED: [],
};

const OFFER: Record<OfferState, OfferState[]> = {
  PENDING: ['ACCEPTED', 'DECLINED', 'WITHDRAWN', 'EXPIRED'],
  ACCEPTED: [],
  DECLINED: [],
  WITHDRAWN: [],
  EXPIRED: [],
};

const ORDER: Record<OrderState, OrderState[]> = {
  AWAITING_PAYMENT: ['PAID', 'CANCELLED'],
  PAID: ['COMPLETED', 'REFUNDED', 'DISPUTED'],
  COMPLETED: ['DISPUTED'],
  CANCELLED: ['REFUNDED'],
  REFUNDED: [],
  DISPUTED: ['REFUNDED', 'COMPLETED'],
};

export function canTransition<T extends string>(table: Record<T, T[]>, from: T, to: T): boolean {
  return table[from]?.includes(to) ?? false;
}

export const listingCan = (from: ListingState, to: ListingState) => canTransition(LISTING, from, to);
export const offerCan = (from: OfferState, to: OfferState) => canTransition(OFFER, from, to);
export const orderCan = (from: OrderState, to: OrderState) => canTransition(ORDER, from, to);

/** Throws the API's 409 when a transition is not allowed. */
export function assertTransition<T extends string>(table: Record<T, T[]>, from: T, to: T, what: string): void {
  if (!canTransition(table, from, to)) throw conflict('INVALID_STATE', `This ${what} is ${from.toLowerCase().replace('_', ' ')} and cannot become ${to.toLowerCase().replace('_', ' ')}.`);
}

export const TABLES = { LISTING, OFFER, ORDER } as const;
