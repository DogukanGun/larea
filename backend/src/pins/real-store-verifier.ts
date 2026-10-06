import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Logger } from '@nestjs/common';
import { Environment, SignedDataVerifier, VerificationException } from '@apple/app-store-server-library';
import { GoogleAuth } from 'google-auth-library';
import type { Env } from '../config/env.js';
import { InvalidPurchaseError, type StoreNotification, StoreUnavailableError, type StoreVerifier, type VerifiedPurchase } from './store-verifier.js';

const PLAY_API = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications';

interface PlayProductPurchase {
  purchaseState?: number;
  consumptionState?: number;
  orderId?: string;
  obfuscatedExternalProfileId?: string;
  purchaseTimeMillis?: string;
  productId?: string;
}

/** The environment a JWS claims, read before verification to pick the verifier (the signature is still checked). */
function claimedEnvironment(jws: string): string | undefined {
  try {
    const payload = JSON.parse(Buffer.from(jws.split('.')[1] ?? '', 'base64url').toString('utf8')) as { environment?: string; data?: { environment?: string } };
    return payload.environment ?? payload.data?.environment;
  } catch {
    return undefined;
  }
}

/**
 * App Store: StoreKit 2 transactions are JWS signed by Apple; the chain is checked against Apple's root
 * certificates. App Review and TestFlight buy in the sandbox even against the production server, so both
 * environments are accepted and recorded. Google Play: the purchase is looked up with a service account.
 */
export class RealStoreVerifier implements StoreVerifier {
  private readonly logger = new Logger(RealStoreVerifier.name);
  private readonly apple = new Map<string, SignedDataVerifier>();
  private readonly google: GoogleAuth | null;

  constructor(private readonly env: Env) {
    const certs = this.loadRootCerts();
    if (certs.length > 0) {
      if (env.APPLE_APP_ID) this.apple.set(Environment.PRODUCTION, new SignedDataVerifier(certs, true, Environment.PRODUCTION, env.APPLE_BUNDLE_ID, env.APPLE_APP_ID));
      this.apple.set(Environment.SANDBOX, new SignedDataVerifier(certs, true, Environment.SANDBOX, env.APPLE_BUNDLE_ID));
    }
    if (env.APPLE_IAP_ALLOW_XCODE) this.apple.set(Environment.XCODE, new SignedDataVerifier([], false, Environment.XCODE, env.APPLE_BUNDLE_ID));
    this.google = env.GOOGLE_PLAY_SERVICE_ACCOUNT_FILE
      ? new GoogleAuth({ keyFile: env.GOOGLE_PLAY_SERVICE_ACCOUNT_FILE, scopes: ['https://www.googleapis.com/auth/androidpublisher'] })
      : null;
  }

  private loadRootCerts(): Buffer[] {
    try {
      return readdirSync(this.env.APPLE_ROOT_CERTS_DIR)
        .filter((f) => f.endsWith('.cer'))
        .map((f) => readFileSync(join(this.env.APPLE_ROOT_CERTS_DIR, f)));
    } catch {
      this.logger.warn({ dir: this.env.APPLE_ROOT_CERTS_DIR }, 'no Apple root certificates; App Store purchases cannot be verified');
      return [];
    }
  }

  private appleVerifier(jws: string): SignedDataVerifier {
    const env = claimedEnvironment(jws);
    const verifier = env ? this.apple.get(env) : undefined;
    if (!verifier) {
      if (this.apple.size === 0) throw new StoreUnavailableError('App Store verification is not configured');
      throw new InvalidPurchaseError(`purchases from the ${env ?? 'unknown'} environment are not accepted here`);
    }
    return verifier;
  }

  async verifyApple(signedTransaction: string): Promise<VerifiedPurchase> {
    const verifier = this.appleVerifier(signedTransaction);
    let tx;
    try {
      tx = await verifier.verifyAndDecodeTransaction(signedTransaction);
    } catch (err) {
      if (err instanceof VerificationException) throw new InvalidPurchaseError(`App Store transaction rejected (${err.status})`);
      throw new StoreUnavailableError((err as Error).message);
    }
    if (!tx.transactionId || !tx.productId) throw new InvalidPurchaseError('incomplete App Store transaction');
    return {
      platform: 'APPLE',
      transactionId: tx.transactionId,
      originalTransactionId: tx.originalTransactionId ?? null,
      productId: tx.productId,
      accountToken: tx.appAccountToken?.toLowerCase() ?? null,
      environment: String(tx.environment ?? 'unknown'),
      revoked: tx.revocationDate !== undefined,
      raw: tx as unknown as Record<string, unknown>,
    };
  }

  async decodeAppleNotification(signedPayload: string): Promise<StoreNotification> {
    const verifier = this.appleVerifier(signedPayload);
    try {
      const n = await verifier.verifyAndDecodeNotification(signedPayload);
      const signedTx = n.data?.signedTransactionInfo;
      const tx = signedTx ? await verifier.verifyAndDecodeTransaction(signedTx) : null;
      return { type: String(n.notificationType ?? ''), transactionId: tx?.transactionId ?? null };
    } catch (err) {
      if (err instanceof VerificationException) throw new InvalidPurchaseError(`notification rejected (${err.status})`);
      throw err;
    }
  }

  private async play<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (!this.google) throw new StoreUnavailableError('Google Play verification is not configured');
    let token: string | null | undefined;
    try {
      token = await this.google.getAccessToken();
    } catch (err) {
      throw new StoreUnavailableError(`Google auth failed: ${(err as Error).message}`);
    }
    let res: Response;
    try {
      res = await fetch(`${PLAY_API}/${encodeURIComponent(this.env.GOOGLE_PLAY_PACKAGE)}/${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err) {
      throw new StoreUnavailableError(`Play API unreachable: ${(err as Error).message}`);
    }
    if (res.status === 400 || res.status === 404 || res.status === 410) throw new InvalidPurchaseError(`Play API ${res.status}`);
    if (!res.ok) throw new StoreUnavailableError(`Play API ${res.status}`);
    const text = await res.text();
    return (text ? JSON.parse(text) : {}) as T;
  }

  async verifyGoogle(productId: string, purchaseToken: string): Promise<VerifiedPurchase> {
    const p = await this.play<PlayProductPurchase>(`purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}`);
    // 0 purchased, 1 cancelled, 2 pending (e.g. cash payment not made yet).
    if (p.purchaseState === 2) throw new InvalidPurchaseError('the payment is still pending');
    return {
      platform: 'GOOGLE',
      transactionId: purchaseToken,
      originalTransactionId: p.orderId ?? null,
      productId,
      accountToken: p.obfuscatedExternalProfileId?.toLowerCase() ?? null,
      environment: p.orderId ? 'Production' : 'Test',
      revoked: p.purchaseState === 1,
      raw: p as Record<string, unknown>,
    };
  }

  async consumeGoogle(productId: string, purchaseToken: string): Promise<void> {
    await this.play(`purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}:consume`, { method: 'POST' });
  }

  async voidedGoogleTokens(sinceMs: number): Promise<string[]> {
    if (!this.google) return [];
    const tokens: string[] = [];
    let page: string | undefined;
    do {
      const query = new URLSearchParams({ startTime: String(sinceMs), type: '0', ...(page ? { token: page } : {}) });
      const res = await this.play<{ voidedPurchases?: { purchaseToken: string }[]; tokenPagination?: { nextPageToken?: string } }>(`purchases/voidedpurchases?${query}`);
      tokens.push(...(res.voidedPurchases ?? []).map((v) => v.purchaseToken));
      page = res.tokenPagination?.nextPageToken;
    } while (page);
    return tokens;
  }
}
