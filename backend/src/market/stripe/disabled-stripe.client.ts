import { PaymentsUnavailableError, type StripeClient } from './stripe.client.js';

/** Used when no Stripe key is configured: every payment operation reports "unavailable". */
export class DisabledStripeClient implements StripeClient {
  readonly testMode = true;

  private off(): never {
    throw new PaymentsUnavailableError('payments are not configured');
  }

  createExpressAccount(): Promise<{ id: string }> {
    return Promise.reject(new PaymentsUnavailableError('payments are not configured'));
  }
  createAccountLink(): Promise<{ url: string; expiresAt: Date }> {
    return Promise.reject(new PaymentsUnavailableError('payments are not configured'));
  }
  retrieveAccount(): Promise<never> {
    return Promise.reject(new PaymentsUnavailableError('payments are not configured'));
  }
  createCheckoutSession(): Promise<never> {
    return Promise.reject(new PaymentsUnavailableError('payments are not configured'));
  }
  expireCheckoutSession(): Promise<void> {
    return Promise.resolve();
  }
  retrievePaymentIntent(): Promise<never> {
    return Promise.reject(new PaymentsUnavailableError('payments are not configured'));
  }
  createTransfer(): Promise<never> {
    return Promise.reject(new PaymentsUnavailableError('payments are not configured'));
  }
  createRefund(): Promise<never> {
    return Promise.reject(new PaymentsUnavailableError('payments are not configured'));
  }
  reverseTransfer(): Promise<never> {
    return Promise.reject(new PaymentsUnavailableError('payments are not configured'));
  }
  constructWebhookEvent(): never {
    this.off();
  }
}
