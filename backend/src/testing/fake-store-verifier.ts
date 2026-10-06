import { InvalidPurchaseError, type StoreNotification, type StoreVerifier, type VerifiedPurchase } from '../pins/store-verifier.js';

export interface FakeAppleTransaction {
  transactionId: string;
  productId: string;
  appAccountToken?: string;
  revocationDate?: number;
  bundleId?: string;
}

/**
 * Store purchases for tests. An App Store "JWS" here is `fake.<base64url JSON>`; Play purchases are
 * registered with `addGoogle` before the app reports them.
 */
export class FakeStoreVerifier implements StoreVerifier {
  readonly google = new Map<string, { productId: string; profileId?: string; state: 0 | 1 | 2 }>();
  readonly consumed: string[] = [];
  voided: string[] = [];

  static appleJws(tx: FakeAppleTransaction): string {
    return `fake.${Buffer.from(JSON.stringify({ bundleId: 'com.dogukangundogan.larea', ...tx })).toString('base64url')}`;
  }

  static appleNotification(type: string, transactionId: string): string {
    return `fake.${Buffer.from(JSON.stringify({ notificationType: type, transactionId })).toString('base64url')}`;
  }

  private decode<T>(jws: string): T {
    const [marker, body] = jws.split('.');
    if (marker !== 'fake' || !body) throw new InvalidPurchaseError('bad signature');
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T;
  }

  async verifyApple(signedTransaction: string): Promise<VerifiedPurchase> {
    const tx = this.decode<FakeAppleTransaction>(signedTransaction);
    if (tx.bundleId !== 'com.dogukangundogan.larea') throw new InvalidPurchaseError('wrong app');
    return {
      platform: 'APPLE',
      transactionId: tx.transactionId,
      originalTransactionId: tx.transactionId,
      productId: tx.productId,
      accountToken: tx.appAccountToken?.toLowerCase() ?? null,
      environment: 'Xcode',
      revoked: tx.revocationDate !== undefined,
      raw: { ...tx },
    };
  }

  addGoogle(purchaseToken: string, productId: string, profileId?: string, state: 0 | 1 | 2 = 0): void {
    this.google.set(purchaseToken, { productId, profileId, state });
  }

  async verifyGoogle(productId: string, purchaseToken: string): Promise<VerifiedPurchase> {
    const p = this.google.get(purchaseToken);
    if (!p || p.productId !== productId) throw new InvalidPurchaseError('unknown purchase');
    if (p.state === 2) throw new InvalidPurchaseError('the payment is still pending');
    return {
      platform: 'GOOGLE',
      transactionId: purchaseToken,
      originalTransactionId: null,
      productId,
      accountToken: p.profileId ?? null,
      environment: 'Test',
      revoked: p.state === 1,
      raw: { ...p },
    };
  }

  async consumeGoogle(_productId: string, purchaseToken: string): Promise<void> {
    this.consumed.push(purchaseToken);
  }

  async decodeAppleNotification(signedPayload: string): Promise<StoreNotification> {
    const n = this.decode<{ notificationType: string; transactionId: string }>(signedPayload);
    return { type: n.notificationType, transactionId: n.transactionId };
  }

  async voidedGoogleTokens(): Promise<string[]> {
    return this.voided;
  }
}
