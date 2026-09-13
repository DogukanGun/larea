/** What the marketplace needs from Stripe, behind an interface so tests use a fake. */
export interface AccountStatus {
  payoutsEnabled: boolean;
  chargesEnabled: boolean;
  detailsSubmitted: boolean;
  requirementsDue: string[];
}

export interface CheckoutInput {
  orderId: string;
  amountCents: number;
  currency: string;
  productName: string;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
  expiresAt: Date;
  statementDescriptorSuffix: string;
}

export interface WebhookEvent {
  id: string;
  type: string;
  account?: string;
  data: { object: Record<string, unknown> };
}

export interface StripeClient {
  readonly testMode: boolean;
  createExpressAccount(input: { userId: string; email: string; country: string }, idempotencyKey: string): Promise<{ id: string }>;
  createAccountLink(accountId: string, urls: { returnUrl: string; refreshUrl: string }): Promise<{ url: string; expiresAt: Date }>;
  retrieveAccount(accountId: string): Promise<AccountStatus>;
  createCheckoutSession(input: CheckoutInput, idempotencyKey: string): Promise<{ id: string; url: string; expiresAt: Date }>;
  expireCheckoutSession(sessionId: string): Promise<void>;
  retrievePaymentIntent(id: string): Promise<{ id: string; latestChargeId: string | null; status: string }>;
  createTransfer(input: { amountCents: number; currency: string; destination: string; orderId: string; chargeId: string | null }, idempotencyKey: string): Promise<{ id: string }>;
  createRefund(input: { paymentIntentId: string; orderId: string }, idempotencyKey: string): Promise<{ id: string }>;
  reverseTransfer(transferId: string, idempotencyKey: string): Promise<{ id: string }>;
  constructWebhookEvent(rawBody: Buffer, signature: string, secret: string): WebhookEvent;
}

export const STRIPE_CLIENT = Symbol('STRIPE_CLIENT');

/** Stripe could not be reached or is rate limiting: the caller should retry later. */
export class PaymentsUnavailableError extends Error {}

/** Stripe rejected the request (card declined, invalid account, ...). */
export class PaymentError extends Error {}
