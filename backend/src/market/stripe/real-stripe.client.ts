import Stripe from 'stripe';
import { type AccountStatus, type CheckoutInput, PaymentError, PaymentsUnavailableError, type StripeClient, type WebhookEvent } from './stripe.client.js';

export class RealStripeClient implements StripeClient {
  private readonly stripe: Stripe;
  readonly testMode: boolean;

  constructor(secretKey: string) {
    this.stripe = new Stripe(secretKey, { timeout: 15_000, maxNetworkRetries: 2 });
    this.testMode = secretKey.startsWith('sk_test_');
  }

  private async call<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (err) {
      if (err instanceof Stripe.errors.StripeConnectionError || err instanceof Stripe.errors.StripeAPIError || err instanceof Stripe.errors.StripeRateLimitError) {
        throw new PaymentsUnavailableError(err.message);
      }
      if (err instanceof Stripe.errors.StripeError) throw new PaymentError(err.message);
      throw err;
    }
  }

  async createExpressAccount(input: { userId: string; email: string; country: string }, idempotencyKey: string): Promise<{ id: string }> {
    const account = await this.call(() =>
      this.stripe.accounts.create(
        { type: 'express', country: input.country, email: input.email, business_type: 'individual', capabilities: { transfers: { requested: true } }, metadata: { userId: input.userId } },
        { idempotencyKey },
      ),
    );
    return { id: account.id };
  }

  async createAccountLink(accountId: string, urls: { returnUrl: string; refreshUrl: string }): Promise<{ url: string; expiresAt: Date }> {
    const link = await this.call(() => this.stripe.accountLinks.create({ account: accountId, type: 'account_onboarding', refresh_url: urls.refreshUrl, return_url: urls.returnUrl }));
    return { url: link.url, expiresAt: new Date(link.expires_at * 1000) };
  }

  async retrieveAccount(accountId: string): Promise<AccountStatus> {
    const account = await this.call(() => this.stripe.accounts.retrieve(accountId));
    return {
      payoutsEnabled: account.payouts_enabled ?? false,
      chargesEnabled: account.charges_enabled ?? false,
      detailsSubmitted: account.details_submitted ?? false,
      requirementsDue: account.requirements?.currently_due ?? [],
    };
  }

  async createCheckoutSession(input: CheckoutInput, idempotencyKey: string): Promise<{ id: string; url: string; expiresAt: Date }> {
    const session = await this.call(() =>
      this.stripe.checkout.sessions.create(
        {
          mode: 'payment',
          origin_context: 'mobile_app',
          payment_method_types: ['card'],
          line_items: [{ quantity: 1, price_data: { currency: input.currency, unit_amount: input.amountCents, product_data: { name: input.productName } } }],
          payment_intent_data: { transfer_group: input.orderId, metadata: { orderId: input.orderId }, statement_descriptor_suffix: input.statementDescriptorSuffix },
          payment_method_options: { card: { request_three_d_secure: 'any' } },
          client_reference_id: input.orderId,
          metadata: { orderId: input.orderId },
          customer_email: input.customerEmail,
          expires_at: Math.floor(input.expiresAt.getTime() / 1000),
          success_url: input.successUrl,
          cancel_url: input.cancelUrl,
        },
        { idempotencyKey },
      ),
    );
    if (!session.url) throw new PaymentError('checkout session has no url');
    return { id: session.id, url: session.url, expiresAt: new Date(session.expires_at * 1000) };
  }

  async expireCheckoutSession(sessionId: string): Promise<void> {
    try {
      await this.call(() => this.stripe.checkout.sessions.expire(sessionId));
    } catch (err) {
      if (err instanceof PaymentError) return; // already completed or expired
      throw err;
    }
  }

  async retrievePaymentIntent(id: string): Promise<{ id: string; latestChargeId: string | null; status: string }> {
    const intent = await this.call(() => this.stripe.paymentIntents.retrieve(id));
    const charge = intent.latest_charge;
    return { id: intent.id, latestChargeId: typeof charge === 'string' ? charge : (charge?.id ?? null), status: intent.status };
  }

  async createTransfer(input: { amountCents: number; currency: string; destination: string; orderId: string; chargeId: string | null }, idempotencyKey: string): Promise<{ id: string }> {
    const transfer = await this.call(() =>
      this.stripe.transfers.create(
        {
          amount: input.amountCents,
          currency: input.currency,
          destination: input.destination,
          transfer_group: input.orderId,
          ...(input.chargeId ? { source_transaction: input.chargeId } : {}),
          metadata: { orderId: input.orderId },
        },
        { idempotencyKey },
      ),
    );
    return { id: transfer.id };
  }

  async createRefund(input: { paymentIntentId: string; orderId: string }, idempotencyKey: string): Promise<{ id: string }> {
    const refund = await this.call(() => this.stripe.refunds.create({ payment_intent: input.paymentIntentId, metadata: { orderId: input.orderId } }, { idempotencyKey }));
    return { id: refund.id };
  }

  async reverseTransfer(transferId: string, idempotencyKey: string): Promise<{ id: string }> {
    const reversal = await this.call(() => this.stripe.transfers.createReversal(transferId, {}, { idempotencyKey }));
    return { id: reversal.id };
  }

  constructWebhookEvent(rawBody: Buffer, signature: string, secret: string): WebhookEvent {
    const event = this.stripe.webhooks.constructEvent(rawBody, signature, secret);
    return { id: event.id, type: event.type, account: event.account, data: { object: event.data.object as unknown as Record<string, unknown> } };
  }
}
