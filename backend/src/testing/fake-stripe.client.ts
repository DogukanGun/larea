import { randomBytes } from 'node:crypto';
import { type AccountStatus, type CheckoutInput, PaymentError, type StripeClient, type WebhookEvent } from '../market/stripe/stripe.client.js';

/**
 * In-memory Stripe for tests: deterministic ids, records every call, replays results for a
 * repeated idempotency key, and accepts webhooks signed with the literal signature `test`.
 */
export class FakeStripeClient implements StripeClient {
  readonly testMode = true;
  private counter = 0;
  readonly accounts = new Map<string, AccountStatus & { userId: string }>();
  readonly sessions: { id: string; input: CheckoutInput; expired: boolean }[] = [];
  readonly transfers: { id: string; amountCents: number; currency: string; destination: string; orderId: string; chargeId: string | null }[] = [];
  readonly refunds: { id: string; paymentIntentId: string; orderId: string }[] = [];
  readonly reversals: { id: string; transferId: string }[] = [];
  private readonly idempotent = new Map<string, unknown>();
  /** Set to make the next call fail like a Stripe outage. */
  failNext: Error | null = null;

  /** Unique across app instances too: the test database outlives one spec file. */
  private next(prefix: string): string {
    this.counter += 1;
    return `${prefix}_test_${this.counter}_${randomBytes(4).toString('hex')}`;
  }

  private replay<T>(key: string, produce: () => T): T {
    if (this.idempotent.has(key)) return this.idempotent.get(key) as T;
    const value = produce();
    this.idempotent.set(key, value);
    return value;
  }

  private maybeFail(): void {
    if (this.failNext) {
      const err = this.failNext;
      this.failNext = null;
      throw err;
    }
  }

  async createExpressAccount(input: { userId: string; email: string; country: string }, idempotencyKey: string): Promise<{ id: string }> {
    this.maybeFail();
    return this.replay(idempotencyKey, () => {
      const id = this.next('acct');
      this.accounts.set(id, { userId: input.userId, payoutsEnabled: false, chargesEnabled: false, detailsSubmitted: false, requirementsDue: ['external_account'] });
      return { id };
    });
  }

  async createAccountLink(accountId: string): Promise<{ url: string; expiresAt: Date }> {
    this.maybeFail();
    return { url: `https://connect.stripe.test/onboard/${accountId}`, expiresAt: new Date(Date.now() + 5 * 60_000) };
  }

  async retrieveAccount(accountId: string): Promise<AccountStatus> {
    this.maybeFail();
    const account = this.accounts.get(accountId);
    if (!account) throw new PaymentError(`no such account ${accountId}`);
    return account;
  }

  /** Test hook: what `account.updated` would report after onboarding. */
  markPayoutsReady(accountId: string): void {
    const account = this.accounts.get(accountId);
    if (account) Object.assign(account, { payoutsEnabled: true, chargesEnabled: true, detailsSubmitted: true, requirementsDue: [] });
  }

  async createCheckoutSession(input: CheckoutInput, idempotencyKey: string): Promise<{ id: string; url: string; expiresAt: Date }> {
    this.maybeFail();
    return this.replay(idempotencyKey, () => {
      const id = this.next('cs');
      this.sessions.push({ id, input, expired: false });
      return { id, url: `https://checkout.stripe.test/${id}`, expiresAt: input.expiresAt };
    });
  }

  async expireCheckoutSession(sessionId: string): Promise<void> {
    const session = this.sessions.find((s) => s.id === sessionId);
    if (session) session.expired = true;
  }

  async retrievePaymentIntent(id: string): Promise<{ id: string; latestChargeId: string | null; status: string }> {
    this.maybeFail();
    return { id, latestChargeId: id.replace('pi_', 'ch_'), status: 'succeeded' };
  }

  async createTransfer(input: { amountCents: number; currency: string; destination: string; orderId: string; chargeId: string | null }, idempotencyKey: string): Promise<{ id: string }> {
    this.maybeFail();
    return this.replay(idempotencyKey, () => {
      const id = this.next('tr');
      this.transfers.push({ id, ...input });
      return { id };
    });
  }

  async createRefund(input: { paymentIntentId: string; orderId: string }, idempotencyKey: string): Promise<{ id: string }> {
    this.maybeFail();
    return this.replay(idempotencyKey, () => {
      const id = this.next('re');
      this.refunds.push({ id, ...input });
      return { id };
    });
  }

  async reverseTransfer(transferId: string, idempotencyKey: string): Promise<{ id: string }> {
    this.maybeFail();
    return this.replay(idempotencyKey, () => {
      const id = this.next('trr');
      this.reversals.push({ id, transferId });
      return { id };
    });
  }

  constructWebhookEvent(rawBody: Buffer, signature: string): WebhookEvent {
    if (signature !== 'test') throw new Error('invalid signature');
    return JSON.parse(rawBody.toString('utf8')) as WebhookEvent;
  }
}
