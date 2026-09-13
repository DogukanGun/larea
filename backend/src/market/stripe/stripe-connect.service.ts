import { Inject, Injectable, Logger } from '@nestjs/common';
import { forbidden, unavailable } from '../../common/errors.js';
import { InjectEnv } from '../../config/inject-env.js';
import type { Env } from '../../config/env.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { RealtimeBus } from '../../realtime/realtime.bus.js';
import { type AccountStatus, PaymentError, PaymentsUnavailableError, STRIPE_CLIENT, type StripeClient } from './stripe.client.js';

export interface StripeAccountView {
  connected: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  requirementsDue: string[];
}

/** How long a "not ready yet" answer is trusted before asking Stripe again. */
const REFRESH_AFTER_MS = 60_000;

@Injectable()
export class StripeConnectService {
  private readonly logger = new Logger(StripeConnectService.name);

  constructor(
    @InjectEnv() private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly bus: RealtimeBus,
    @Inject(STRIPE_CLIENT) private readonly stripe: StripeClient,
  ) {}

  private translate(err: unknown): never {
    if (err instanceof PaymentsUnavailableError) throw unavailable('PAYMENTS_UNAVAILABLE', "Payments aren't available right now. Please try again in a moment.");
    if (err instanceof PaymentError) throw forbidden('PAYMENT_ERROR', err.message);
    throw err;
  }

  /** Creates the Express account on first use and returns a fresh onboarding link. */
  async accountLink(user: { id: string; email: string }): Promise<{ url: string; expiresAt: string }> {
    try {
      let account = await this.prisma.stripeAccount.findUnique({ where: { userId: user.id } });
      if (!account) {
        const created = await this.stripe.createExpressAccount({ userId: user.id, email: user.email, country: this.env.STRIPE_ACCOUNT_COUNTRY }, `user:${user.id}:stripe-account`);
        account = await this.prisma.stripeAccount.upsert({
          where: { userId: user.id },
          update: {},
          create: { userId: user.id, stripeAccountId: created.id },
        });
        // A brand-new account already knows what Stripe still needs from the person.
        try {
          account = (await this.apply(created.id, await this.stripe.retrieveAccount(created.id))) ?? account;
        } catch {
          // status arrives with account.updated later
        }
      }
      const base = this.env.PUBLIC_URL.replace(/\/$/, '');
      const link = await this.stripe.createAccountLink(account.stripeAccountId, { returnUrl: `${base}/market/stripe/return`, refreshUrl: `${base}/market/stripe/refresh` });
      return { url: link.url, expiresAt: link.expiresAt.toISOString() };
    } catch (err) {
      this.translate(err);
    }
  }

  async status(userId: string, refresh = false): Promise<StripeAccountView> {
    const account = await this.prisma.stripeAccount.findUnique({ where: { userId } });
    if (!account) return { connected: false, payoutsEnabled: false, detailsSubmitted: false, requirementsDue: [] };
    const stale = Date.now() - account.syncedAt.getTime() > REFRESH_AFTER_MS;
    if (refresh || (!account.payoutsEnabled && stale)) {
      try {
        const fresh = await this.stripe.retrieveAccount(account.stripeAccountId);
        return this.toView(await this.apply(account.stripeAccountId, fresh));
      } catch (err) {
        if (!(err instanceof PaymentsUnavailableError)) this.translate(err);
        this.logger.warn({ userId }, 'stripe account refresh failed; using cached status');
      }
    }
    return this.toView(account);
  }

  /** Whether money can be sent to this user; refreshes once when the cached answer is no. */
  async isPayoutReady(userId: string): Promise<boolean> {
    return (await this.status(userId)).payoutsEnabled;
  }

  async destinationFor(userId: string): Promise<string | null> {
    const account = await this.prisma.stripeAccount.findUnique({ where: { userId } });
    return account?.payoutsEnabled ? account.stripeAccountId : null;
  }

  /** `account.updated` from a Connect webhook, or a manual refresh. */
  async apply(stripeAccountId: string, status: AccountStatus) {
    const before = await this.prisma.stripeAccount.findUnique({ where: { stripeAccountId } });
    if (!before) return null;
    const after = await this.prisma.stripeAccount.update({
      where: { stripeAccountId },
      data: { payoutsEnabled: status.payoutsEnabled, chargesEnabled: status.chargesEnabled, detailsSubmitted: status.detailsSubmitted, requirementsDue: status.requirementsDue, syncedAt: new Date() },
    });
    if (!before.payoutsEnabled && after.payoutsEnabled) {
      this.bus.toUser(after.userId, { type: 'market_update', kind: 'payouts_ready', listingId: '' });
      this.logger.log({ userId: after.userId }, 'stripe payouts enabled');
    }
    return after;
  }

  private toView(account: { payoutsEnabled: boolean; detailsSubmitted: boolean; requirementsDue: string[] } | null): StripeAccountView {
    if (!account) return { connected: false, payoutsEnabled: false, detailsSubmitted: false, requirementsDue: [] };
    return { connected: true, payoutsEnabled: account.payoutsEnabled, detailsSubmitted: account.detailsSubmitted, requirementsDue: account.requirementsDue };
  }
}
