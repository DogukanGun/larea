import { Inject, Injectable, Logger } from '@nestjs/common';
import { badRequest } from '../../common/errors.js';
import { InjectEnv } from '../../config/inject-env.js';
import type { Env } from '../../config/env.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { OrdersService } from '../orders.service.js';
import { StripeConnectService } from './stripe-connect.service.js';
import { STRIPE_CLIENT, type StripeClient, type WebhookEvent } from './stripe.client.js';

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});

/** Verifies, de-duplicates and dispatches Stripe events. Errors leave the event unprocessed so Stripe retries. */
@Injectable()
export class StripeWebhookService {
  private readonly logger = new Logger(StripeWebhookService.name);

  constructor(
    @InjectEnv() private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly connect: StripeConnectService,
    @Inject(STRIPE_CLIENT) private readonly stripe: StripeClient,
  ) {}

  verify(rawBody: Buffer | undefined, signature: string | undefined, kind: 'account' | 'connect'): WebhookEvent {
    if (!rawBody || !signature) throw badRequest('WEBHOOK_SIGNATURE', 'Missing signature.');
    const secrets = kind === 'connect'
      ? [this.env.STRIPE_CONNECT_WEBHOOK_SECRET, this.env.STRIPE_WEBHOOK_SECRET]
      : [this.env.STRIPE_WEBHOOK_SECRET, this.env.STRIPE_CONNECT_WEBHOOK_SECRET];
    for (const secret of secrets.filter((s): s is string => Boolean(s))) {
      try {
        return this.stripe.constructWebhookEvent(rawBody, signature, secret);
      } catch {
        // try the other secret
      }
    }
    this.logger.warn('stripe.webhook.invalid_signature');
    throw badRequest('WEBHOOK_SIGNATURE', 'Invalid signature.');
  }

  async handle(event: WebhookEvent): Promise<{ received: true; duplicate?: true }> {
    const existing = await this.prisma.stripeEvent.upsert({
      where: { id: event.id },
      update: {},
      create: { id: event.id, type: event.type, account: event.account ?? null },
    });
    if (existing.processedAt) return { received: true, duplicate: true };
    try {
      await this.dispatch(event);
      await this.prisma.stripeEvent.update({ where: { id: event.id }, data: { processedAt: new Date(), error: null } });
      return { received: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.prisma.stripeEvent.update({ where: { id: event.id }, data: { error: message.slice(0, 500) } });
      this.logger.error({ eventId: event.id, type: event.type, err: message }, 'stripe.webhook.failed');
      throw err;
    }
  }

  private async dispatch(event: WebhookEvent): Promise<void> {
    const object = event.data.object;
    switch (event.type) {
      case 'account.updated': {
        const id = str(object.id);
        if (!id) return;
        const requirements = obj(object.requirements);
        await this.connect.apply(id, {
          payoutsEnabled: object.payouts_enabled === true,
          chargesEnabled: object.charges_enabled === true,
          detailsSubmitted: object.details_submitted === true,
          requirementsDue: Array.isArray(requirements.currently_due) ? (requirements.currently_due as string[]) : [],
        });
        return;
      }
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        if (object.payment_status !== 'paid') return;
        const orderId = str(object.client_reference_id) ?? str(obj(object.metadata).orderId);
        if (!orderId) return;
        const paymentIntentId = str(object.payment_intent);
        let chargeId: string | null = null;
        if (paymentIntentId) {
          try {
            chargeId = (await this.stripe.retrievePaymentIntent(paymentIntentId)).latestChargeId;
          } catch {
            chargeId = null;
          }
        }
        await this.orders.markPaid(orderId, paymentIntentId, chargeId);
        return;
      }
      case 'payment_intent.succeeded': {
        const orderId = str(obj(object.metadata).orderId);
        if (!orderId) return;
        const charge = object.latest_charge;
        await this.orders.markPaid(orderId, str(object.id), typeof charge === 'string' ? charge : str(obj(charge).id));
        return;
      }
      case 'checkout.session.expired': {
        const sessionId = str(object.id);
        if (sessionId) await this.prisma.order.updateMany({ where: { stripeCheckoutSessionId: sessionId, status: 'AWAITING_PAYMENT' }, data: { stripeCheckoutUrl: null, checkoutExpiresAt: null } });
        return;
      }
      case 'charge.refunded': {
        const paymentIntentId = str(object.payment_intent);
        const refunds = obj(object.refunds);
        const first = Array.isArray(refunds.data) ? obj(refunds.data[0]) : {};
        if (paymentIntentId) await this.orders.markRefundedExternally(paymentIntentId, str(first.id));
        return;
      }
      case 'charge.dispute.created': {
        const paymentIntentId = str(object.payment_intent);
        if (paymentIntentId) await this.orders.markDisputed(paymentIntentId);
        return;
      }
      default:
        return; // ignored event type
    }
  }
}
