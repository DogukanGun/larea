/** A store purchase whose signature (App Store) or server record (Google Play) checked out. */
export interface VerifiedPurchase {
  platform: 'APPLE' | 'GOOGLE';
  transactionId: string;
  originalTransactionId: string | null;
  productId: string;
  /** StoreKit's appAccountToken or Play's obfuscated profile id: the pin the app said it was paying for. */
  accountToken: string | null;
  environment: string;
  /** Refunded or revoked by the store. */
  revoked: boolean;
  /** The decoded payload, kept for support and disputes. */
  raw: Record<string, unknown>;
}

/** An App Store Server Notification (v2) reduced to what pins care about. */
export interface StoreNotification {
  type: string;
  transactionId: string | null;
}

/** App Store and Google Play receipt checks, behind one token so tests use a fake (the STRIPE_CLIENT pattern). */
export interface StoreVerifier {
  /** Verifies a StoreKit 2 transaction (its jwsRepresentation). */
  verifyApple(signedTransaction: string): Promise<VerifiedPurchase>;
  /** Looks a Play purchase up with the Play Developer API. */
  verifyGoogle(productId: string, purchaseToken: string): Promise<VerifiedPurchase>;
  /** Marks a Play consumable as used so it can be bought again (also acknowledges it). */
  consumeGoogle(productId: string, purchaseToken: string): Promise<void>;
  /** Verifies and decodes an App Store Server Notification's signedPayload. */
  decodeAppleNotification(signedPayload: string): Promise<StoreNotification>;
  /** Play purchase tokens refunded or charged back since the given time. */
  voidedGoogleTokens(sinceMs: number): Promise<string[]>;
}

export const STORE_VERIFIER = Symbol('STORE_VERIFIER');

/** The purchase is not genuine, not for this app, or not complete. */
export class InvalidPurchaseError extends Error {}
/** The store could not be asked right now; the app should retry. */
export class StoreUnavailableError extends Error {}

export class DisabledStoreVerifier implements StoreVerifier {
  private fail(): never {
    throw new StoreUnavailableError('store purchases are not configured');
  }
  verifyApple(): Promise<VerifiedPurchase> {
    this.fail();
  }
  verifyGoogle(): Promise<VerifiedPurchase> {
    this.fail();
  }
  consumeGoogle(): Promise<void> {
    this.fail();
  }
  decodeAppleNotification(): Promise<StoreNotification> {
    this.fail();
  }
  async voidedGoogleTokens(): Promise<string[]> {
    return [];
  }
}
