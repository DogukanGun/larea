import { Inject, Injectable, Logger } from '@nestjs/common';
import { badRequest, conflict, forbidden, notFound, tooMany, unavailable } from '../common/errors.js';
import type { UserSnapshot } from '../common/types.js';
import { InjectEnv } from '../config/inject-env.js';
import type { Env } from '../config/env.js';
import { type Order, type OrderStatus, type PaymentRail, Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../infra/prisma/prisma.service.js';
import { RedisService } from '../infra/redis/redis.service.js';
import { MEDIA_SUMMARY_SELECT, MediaService, type MediaSummary } from '../media/media.service.js';
import type { MarketUpdateKind } from '../realtime/protocol.js';
import { RealtimeBus } from '../realtime/realtime.bus.js';
import { SOLANA_CLIENT, type SolanaClient, SolanaUnavailableError, TransactionMismatchError } from '../solana/solana.client.js';
import { computeFee } from './fees.js';
import { HANDOVER_LOCK_MS, HANDOVER_MAX_ATTEMPTS, generateHandoverCode, handoverCodesMatch } from './handover.js';
import { TABLES, assertTransition, orderCan } from './state-machine.js';
import { StripeConnectService } from './stripe/stripe-connect.service.js';
import { PaymentError, PaymentsUnavailableError, STRIPE_CLIENT, type StripeClient } from './stripe/stripe.client.js';

export interface OrderView {
  id: string;
  listingId: string;
  listing: { id: string; title: string; kind: 'OFFER' | 'REQUEST'; priceCents: number; thumbUrl: string | null; status: string };
  offerId: string;
  payer: { id: string; displayName: string };
  payee: { id: string; displayName: string };
  role: 'payer' | 'payee';
  amountCents: number;
  feeCents: number;
  payoutCents: number;
  currency: string;
  /** SOLANA_USDC deals are paid from the buyer's wallet into Larea's escrow and paid out on approval. */
  paymentRail: PaymentRail;
  /** SOLANA_USDC: the escrow payment, payout and refund transactions, once they exist. */
  solana: { paySignature: string | null; payoutSignature: string | null; refundSignature: string | null } | null;
  status: OrderStatus;
  cancelReason: string | null;
  /** Payer only, while the order is paid and waiting for the handover. */
  handoverCode: string | null;
  paymentDueAt: string;
  paidAt: string | null;
  approvalDeadlineAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  refundedAt: string | null;
  /** Payer only: an open Checkout session to resume. */
  checkout: { url: string; expiresAt: string } | null;
  createdAt: string;
}

const ORDER_INCLUDE = {
  payer: { select: { id: true, displayName: true } },
  payee: { select: { id: true, displayName: true } },
  listing: { select: { id: true, title: true, kind: true, priceCents: true, status: true, images: { orderBy: { position: 'asc' as const }, take: 1, include: { media: { select: MEDIA_SUMMARY_SELECT } } } } },
} as const;

type OrderRow = Order & {
  payer: { id: string; displayName: string };
  payee: { id: string; displayName: string };
  listing: { id: string; title: string; kind: 'OFFER' | 'REQUEST'; priceCents: number; status: string; images: { media: MediaSummary }[] };
};

const LOCK_MS = 30_000;

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectEnv() private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly media: MediaService,
    private readonly connect: StripeConnectService,
    private readonly bus: RealtimeBus,
    @Inject(STRIPE_CLIENT) private readonly stripe: StripeClient,
    @Inject(SOLANA_CLIENT) private readonly solana: SolanaClient,
  ) {}

  // MARK: views

  toView(row: OrderRow, viewerId: string): OrderView {
    const role: 'payer' | 'payee' = row.payerId === viewerId ? 'payer' : 'payee';
    const thumb = row.listing.images[0] ? (this.media.toView(row.listing.images[0].media)?.thumbUrl ?? null) : null;
    const checkoutOpen = row.stripeCheckoutUrl && row.checkoutExpiresAt && row.checkoutExpiresAt.getTime() > Date.now();
    return {
      id: row.id,
      listingId: row.listingId,
      listing: { id: row.listing.id, title: row.listing.title, kind: row.listing.kind, priceCents: row.listing.priceCents, thumbUrl: thumb, status: row.listing.status },
      offerId: row.offerId,
      payer: row.payer,
      payee: row.payee,
      role,
      amountCents: row.amountCents,
      feeCents: row.feeCents,
      payoutCents: row.amountCents - row.feeCents,
      currency: row.currency,
      paymentRail: row.paymentRail,
      solana:
        row.paymentRail === 'SOLANA_USDC'
          ? { paySignature: row.solanaPaySignature, payoutSignature: row.payoutSignature, refundSignature: row.refundSignature }
          : null,
      status: row.status,
      cancelReason: row.cancelReason,
      handoverCode: role === 'payer' && row.status === 'PAID' ? row.handoverCode : null,
      paymentDueAt: row.paymentDueAt.toISOString(),
      paidAt: row.paidAt?.toISOString() ?? null,
      approvalDeadlineAt: row.approvalDeadlineAt?.toISOString() ?? null,
      completedAt: row.completedAt?.toISOString() ?? null,
      cancelledAt: row.cancelledAt?.toISOString() ?? null,
      refundedAt: row.refundedAt?.toISOString() ?? null,
      checkout: role === 'payer' && row.status === 'AWAITING_PAYMENT' && checkoutOpen ? { url: row.stripeCheckoutUrl!, expiresAt: row.checkoutExpiresAt!.toISOString() } : null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private translate(err: unknown): never {
    if (err instanceof PaymentsUnavailableError) throw unavailable('PAYMENTS_UNAVAILABLE', "Payments aren't available right now. Please try again in a moment.");
    if (err instanceof PaymentError) throw conflict('PAYMENT_ERROR', err.message);
    if (err instanceof SolanaUnavailableError) throw unavailable('SOLANA_UNAVAILABLE', 'Solana is not reachable right now. Please try again in a moment.');
    if (err instanceof TransactionMismatchError) throw badRequest('TRANSACTION_MISMATCH', 'The signed transaction is not the one Larea prepared.');
    throw err;
  }

  private async withLock<T>(orderId: string, run: () => Promise<T>): Promise<T> {
    const key = `lock:order:${orderId}`;
    if (!(await this.redis.acquireLock(key, LOCK_MS))) throw conflict('BUSY', 'This deal is being updated. Please try again.');
    try {
      return await run();
    } finally {
      await this.redis.client.del(key);
    }
  }

  private notifyBoth(row: Pick<Order, 'id' | 'listingId' | 'offerId' | 'payerId' | 'payeeId'>, kind: MarketUpdateKind): void {
    for (const userId of [row.payerId, row.payeeId]) this.bus.toUser(userId, { type: 'market_update', kind, listingId: row.listingId, offerId: row.offerId, orderId: row.id });
  }

  // MARK: creation

  /** Sum of money a user has moving today, on either side. */
  async dailyVolume(userId: string): Promise<number> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const rows = await this.prisma.order.findMany({
      where: { OR: [{ payerId: userId }, { payeeId: userId }], createdAt: { gte: since }, status: { notIn: ['CANCELLED', 'REFUNDED'] } },
      select: { amountCents: true },
    });
    return rows.reduce((sum, r) => sum + r.amountCents, 0);
  }

  async assertWithinDailyCap(userId: string, amountCents: number): Promise<void> {
    if ((await this.dailyVolume(userId)) + amountCents > this.env.MARKET_MAX_DAILY_VOLUME_CENTS) {
      throw conflict('DAILY_LIMIT', `That would exceed the daily limit of ${this.env.MARKET_MAX_DAILY_VOLUME_CENTS / 100} ${this.env.MARKET_CURRENCY.toUpperCase()}.`);
    }
  }

  /** Called once an offer is accepted; the payer has MARKET_PAYMENT_WINDOW_HOURS to pay. */
  async createForOffer(input: {
    offerId: string;
    listingId: string;
    listingTitle: string;
    payerId: string;
    payeeId: string;
    amountCents: number;
    paymentRail?: PaymentRail;
  }): Promise<OrderRow> {
    const fee = computeFee(input.amountCents, this.env.MARKET_FEE_PERCENT, this.env.MARKET_FEE_MIN_CENTS);
    const usdc = input.paymentRail === 'SOLANA_USDC';
    return this.prisma.order.create({
      data: {
        listingId: input.listingId,
        offerId: input.offerId,
        payerId: input.payerId,
        payeeId: input.payeeId,
        amountCents: fee.amountCents,
        feeCents: fee.feeCents,
        currency: usdc ? 'usdc' : this.env.MARKET_CURRENCY,
        paymentRail: input.paymentRail ?? 'STRIPE',
        listingTitle: input.listingTitle,
        paymentDueAt: new Date(Date.now() + this.env.MARKET_PAYMENT_WINDOW_HOURS * 3_600_000),
      },
      include: ORDER_INCLUDE,
    });
  }

  // MARK: reads

  async get(user: UserSnapshot, orderId: string): Promise<OrderView> {
    const row = await this.prisma.order.findUnique({ where: { id: orderId }, include: ORDER_INCLUDE });
    if (!row || (row.payerId !== user.id && row.payeeId !== user.id)) throw notFound('Deal not found.');
    return this.toView(row, user.id);
  }

  async mine(userId: string): Promise<OrderView[]> {
    const rows = await this.prisma.order.findMany({ where: { OR: [{ payerId: userId }, { payeeId: userId }] }, include: ORDER_INCLUDE, orderBy: { createdAt: 'desc' }, take: 100 });
    return rows.map((r) => this.toView(r, userId));
  }

  // MARK: checkout and payment

  async checkout(user: UserSnapshot, orderId: string): Promise<{ url: string; expiresAt: string }> {
    return this.withLock(orderId, async () => {
      const row = await this.prisma.order.findUnique({ where: { id: orderId }, include: { payer: { select: { email: true } } } });
      if (!row || (row.payerId !== user.id && row.payeeId !== user.id)) throw notFound('Deal not found.');
      if (row.payerId !== user.id) throw forbidden('FORBIDDEN', 'Only the buyer pays for this deal.');
      if (row.paymentRail === 'SOLANA_USDC') throw conflict('USE_WALLET', 'This deal is paid in USDC from your wallet.');
      if (row.status !== 'AWAITING_PAYMENT') throw conflict('INVALID_STATE', 'This deal is not waiting for payment.');
      if (row.paymentDueAt.getTime() < Date.now()) throw conflict('INVALID_STATE', 'The payment window for this deal has closed.');
      if (row.stripeCheckoutUrl && row.checkoutExpiresAt && row.checkoutExpiresAt.getTime() > Date.now() + 60_000) {
        return { url: row.stripeCheckoutUrl, expiresAt: row.checkoutExpiresAt.toISOString() };
      }
      const attempt = row.checkoutAttempt + 1;
      const base = this.env.PUBLIC_URL.replace(/\/$/, '');
      try {
        const session = await this.stripe.createCheckoutSession(
          {
            orderId,
            amountCents: row.amountCents,
            currency: row.currency,
            productName: row.listingTitle.slice(0, 80),
            customerEmail: row.payer.email,
            successUrl: `${base}/market/orders/${orderId}/return?checkout=success`,
            cancelUrl: `${base}/market/orders/${orderId}/return?checkout=cancel`,
            expiresAt: new Date(Date.now() + 30 * 60_000),
            statementDescriptorSuffix: 'LAREA',
          },
          `order:${orderId}:checkout:${attempt}`,
        );
        await this.prisma.order.update({
          where: { id: orderId },
          data: { stripeCheckoutSessionId: session.id, stripeCheckoutUrl: session.url, checkoutExpiresAt: session.expiresAt, checkoutAttempt: attempt },
        });
        return { url: session.url, expiresAt: session.expiresAt.toISOString() };
      } catch (err) {
        this.translate(err);
      }
    });
  }

  /** Payment confirmed by Stripe. Idempotent; a payment landing after a cancel is refunded. */
  async markPaid(orderId: string, paymentIntentId: string | null, chargeId: string | null): Promise<void> {
    await this.withLock(orderId, async () => {
      const row = await this.prisma.order.findUnique({ where: { id: orderId } });
      if (!row) {
        this.logger.warn({ orderId }, 'stripe.webhook.unknown_order');
        return;
      }
      if (row.status === 'CANCELLED') {
        this.logger.warn({ orderId }, 'payment arrived after cancellation; refunding');
        await this.prisma.order.update({ where: { id: orderId }, data: { stripePaymentIntentId: paymentIntentId ?? row.stripePaymentIntentId, stripeChargeId: chargeId ?? row.stripeChargeId } });
        await this.refundLocked(row.id, 'late_payment');
        return;
      }
      if (row.status !== 'AWAITING_PAYMENT') return;
      const now = new Date();
      const updated = await this.prisma.order.update({
        where: { id: orderId },
        data: {
          status: 'PAID',
          paidAt: now,
          approvalDeadlineAt: new Date(now.getTime() + this.env.MARKET_APPROVAL_DAYS * 86_400_000),
          stripePaymentIntentId: paymentIntentId ?? row.stripePaymentIntentId,
          stripeChargeId: chargeId ?? row.stripeChargeId,
          handoverCode: generateHandoverCode(),
        },
      });
      this.notifyBoth(updated, 'order_paid');
      this.logger.log({ orderId }, 'order paid');
    });
  }

  /** The payee enters the payer's code at the handover; the money is transferred. */
  async approve(user: UserSnapshot, orderId: string, code: string): Promise<OrderView> {
    return this.withLock(orderId, async () => {
      const row = await this.prisma.order.findUnique({ where: { id: orderId }, include: ORDER_INCLUDE });
      if (!row || (row.payerId !== user.id && row.payeeId !== user.id)) throw notFound('Deal not found.');
      if (row.payeeId !== user.id) throw forbidden('FORBIDDEN', 'Only the seller can approve the handover.');
      if (row.status !== 'PAID') throw conflict('INVALID_STATE', 'This deal is not waiting for a handover.');
      if (row.handoverLockedUntil && row.handoverLockedUntil.getTime() > Date.now()) {
        throw tooMany('Too many wrong codes. Try again later.', { retryAfterSec: Math.ceil((row.handoverLockedUntil.getTime() - Date.now()) / 1000) });
      }
      if (!row.handoverCode || !handoverCodesMatch(row.handoverCode, code)) {
        const attempts = row.handoverAttempts + 1;
        const lock = attempts >= HANDOVER_MAX_ATTEMPTS;
        await this.prisma.order.update({
          where: { id: orderId },
          data: { handoverAttempts: lock ? 0 : attempts, handoverLockedUntil: lock ? new Date(Date.now() + HANDOVER_LOCK_MS) : null },
        });
        if (lock) throw tooMany('Too many wrong codes. Try again in an hour.', { retryAfterSec: HANDOVER_LOCK_MS / 1000 });
        throw badRequest('INVALID_CODE', `That code is wrong. ${HANDOVER_MAX_ATTEMPTS - attempts} attempts left.`);
      }
      if (row.paymentRail === 'STRIPE' && !(await this.connect.destinationFor(row.payeeId))) {
        throw forbidden('PAYOUTS_NOT_READY', 'Set up payouts before approving.', { action: 'stripe_onboarding' });
      }
      try {
        const payout = await this.payOut(row);
        const updated = await this.prisma.order.update({
          where: { id: orderId },
          data: { status: 'COMPLETED', ...payout, completedAt: new Date(), handoverCode: null },
          include: ORDER_INCLUDE,
        });
        await this.prisma.listing.updateMany({ where: { id: row.listingId, status: { in: ['ACTIVE', 'RESERVED'] } }, data: { status: 'SOLD' } });
        await this.declineOtherOffers(row.listingId, row.offerId);
        this.notifyBoth(updated, 'order_completed');
        this.logger.log({ orderId, ...payout }, 'order completed');
        return this.toView(updated, user.id);
      } catch (err) {
        this.logger.error({ orderId, err: err instanceof Error ? err.message : String(err) }, 'stripe.transfer.failed');
        this.translate(err);
      }
    });
  }

  /** Either side backs out: unpaid deals are cancelled, paid ones refunded. */
  async cancel(user: UserSnapshot, orderId: string): Promise<OrderView> {
    return this.withLock(orderId, async () => {
      const row = await this.prisma.order.findUnique({ where: { id: orderId }, include: ORDER_INCLUDE });
      if (!row || (row.payerId !== user.id && row.payeeId !== user.id)) throw notFound('Deal not found.');
      const reason = row.payerId === user.id ? 'payer_cancelled' : 'payee_cancelled';
      if (row.status === 'AWAITING_PAYMENT' && row.solanaPaySignature) {
        throw conflict('PAYMENT_PENDING', 'A payment for this deal is being confirmed. Try again in a moment.');
      }
      if (row.status === 'AWAITING_PAYMENT') {
        await this.cancelLocked(row, reason);
      } else if (row.status === 'PAID') {
        await this.refundLocked(row.id, reason);
      } else {
        throw conflict('INVALID_STATE', 'This deal can no longer be cancelled.');
      }
      const fresh = await this.prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: ORDER_INCLUDE });
      return this.toView(fresh, user.id);
    });
  }

  private async cancelLocked(row: OrderRow | Order, reason: string): Promise<void> {
    assertTransition(TABLES.ORDER, row.status, 'CANCELLED', 'deal');
    if (row.stripeCheckoutSessionId) await this.stripe.expireCheckoutSession(row.stripeCheckoutSessionId).catch(() => undefined);
    const updated = await this.prisma.order.update({
      where: { id: row.id },
      data: { status: 'CANCELLED', cancelReason: reason, cancelledAt: new Date(), stripeCheckoutUrl: null, checkoutExpiresAt: null },
    });
    await this.reopenListing(row.listingId);
    this.notifyBoth(updated, 'order_cancelled');
  }

  private async refundLocked(orderId: string, reason: string): Promise<void> {
    const row = await this.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    if (!orderCan(row.status, 'REFUNDED')) throw conflict('INVALID_STATE', 'This deal cannot be refunded.');
    try {
      let refunded: { stripeRefundId?: string; refundSignature?: string };
      if (row.paymentRail === 'SOLANA_USDC') {
        if (!row.solanaPaySignature || !row.payerWallet) throw conflict('INVALID_STATE', 'No payment to refund.');
        refunded = { refundSignature: row.refundSignature ?? (await this.fromEscrow(row.payerWallet, row.amountCents, `larea:refund:${orderId}`)) };
      } else {
        if (!row.stripePaymentIntentId) throw conflict('INVALID_STATE', 'No payment to refund.');
        refunded = { stripeRefundId: (await this.stripe.createRefund({ paymentIntentId: row.stripePaymentIntentId, orderId }, `order:${orderId}:refund`)).id };
      }
      const updated = await this.prisma.order.update({
        where: { id: orderId },
        data: { status: 'REFUNDED', cancelReason: reason, refundedAt: new Date(), ...refunded, handoverCode: null },
      });
      await this.reopenListing(row.listingId);
      this.notifyBoth(updated, 'order_refunded');
      this.logger.log({ orderId, reason }, 'order refunded');
    } catch (err) {
      this.logger.error({ orderId, rail: row.paymentRail, err: err instanceof Error ? err.message : String(err) }, 'refund failed');
      this.translate(err);
    }
  }

  private async reopenListing(listingId: string): Promise<void> {
    await this.prisma.listing.updateMany({ where: { id: listingId, status: 'RESERVED' }, data: { status: 'ACTIVE' } });
  }

  private async declineOtherOffers(listingId: string, keepOfferId: string): Promise<void> {
    const pending = await this.prisma.offer.findMany({ where: { listingId, status: 'PENDING', id: { not: keepOfferId } }, select: { id: true, offererId: true } });
    if (pending.length === 0) return;
    await this.prisma.offer.updateMany({ where: { id: { in: pending.map((o) => o.id) } }, data: { status: 'DECLINED', respondedAt: new Date() } });
    for (const o of pending) this.bus.toUser(o.offererId, { type: 'market_update', kind: 'offer_declined', listingId, offerId: o.id });
  }

  // MARK: USDC rail (Solana dApp Store build)

  /** Seller's share out of escrow: a Stripe transfer, or USDC from Larea's escrow wallet to the seller's wallet. */
  private async payOut(row: Order): Promise<{ stripeTransferId?: string; payoutSignature?: string; payeeWallet?: string }> {
    if (row.paymentRail === 'SOLANA_USDC') {
      if (row.payoutSignature) return { payoutSignature: row.payoutSignature };
      const wallet = await this.prisma.wallet.findUnique({ where: { userId: row.payeeId } });
      if (!wallet) throw forbidden('WALLET_REQUIRED', 'Connect a wallet to receive the USDC before approving.');
      const signature = await this.fromEscrow(wallet.address, row.amountCents - row.feeCents, `larea:payout:${row.id}`);
      return { payoutSignature: signature, payeeWallet: wallet.address };
    }
    if (row.stripeTransferId) return { stripeTransferId: row.stripeTransferId };
    const destination = (await this.connect.destinationFor(row.payeeId))!;
    const transfer = await this.stripe.createTransfer(
      { amountCents: row.amountCents - row.feeCents, currency: row.currency, destination, orderId: row.id, chargeId: row.stripeChargeId },
      `order:${row.id}:transfer`,
    );
    return { stripeTransferId: transfer.id };
  }

  /** USDC cents → base units (6 decimals) out of the escrow wallet. */
  private fromEscrow(to: string, cents: number, memo: string): Promise<string> {
    return this.solana.sendFromCustody({ wallet: 'escrow', to, token: 'USDC', amount: BigInt(cents) * 10_000n, memo });
  }

  private async payerOrder(user: UserSnapshot, orderId: string): Promise<Order> {
    const row = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!row || (row.payerId !== user.id && row.payeeId !== user.id)) throw notFound('Deal not found.');
    if (row.payerId !== user.id) throw forbidden('FORBIDDEN', 'Only the buyer pays for this deal.');
    if (row.paymentRail !== 'SOLANA_USDC') throw conflict('USE_CHECKOUT', 'This deal is paid by card.');
    return row;
  }

  /** The buyer's wallet pays the full amount into Larea's escrow; returns the transfer for the wallet to sign. */
  async solanaPay(user: UserSnapshot, orderId: string): Promise<{ transaction: string; cluster: SolanaClient['cluster']; order: OrderView }> {
    return this.withLock(orderId, async () => {
      const row = await this.payerOrder(user, orderId);
      if (row.status !== 'AWAITING_PAYMENT') throw conflict('INVALID_STATE', 'This deal is not waiting for payment.');
      if (row.paymentDueAt.getTime() < Date.now()) throw conflict('INVALID_STATE', 'The payment window for this deal has closed.');
      if (row.solanaPaySignature) throw conflict('PAYMENT_PENDING', 'Your payment is on its way. Give it a moment.');
      const [wallet, escrow] = [await this.prisma.wallet.findUnique({ where: { userId: user.id } }), this.solana.custodyAddress('escrow')];
      if (!wallet) throw conflict('WALLET_REQUIRED', 'Connect a wallet in your profile to pay in USDC.');
      if (!escrow) throw unavailable('SOLANA_UNAVAILABLE', "USDC payments aren't available right now.");
      try {
        const prepared = await this.solana.buildTransfer({ from: wallet.address, to: escrow, token: 'USDC', amount: BigInt(row.amountCents) * 10_000n, memo: `larea:order:${orderId}` });
        const updated = await this.prisma.order.update({
          where: { id: orderId },
          data: { payerWallet: wallet.address, solanaPayHash: prepared.messageHash, solanaPayExpiresAt: new Date(Date.now() + this.env.SOLANA_PENDING_TTL_SEC * 1000) },
          include: ORDER_INCLUDE,
        });
        return { transaction: prepared.transaction, cluster: this.solana.cluster, order: this.toView(updated, user.id) };
      } catch (err) {
        this.translate(err);
      }
    });
  }

  /** Records the payment's signature: sent by Larea (`signedTransaction`, when the wallet only signs) or by the wallet. */
  async solanaSubmit(user: UserSnapshot, orderId: string, input: { signedTransaction?: string; signature?: string }): Promise<OrderView> {
    await this.withLock(orderId, async () => {
      const row = await this.payerOrder(user, orderId);
      if (row.status !== 'AWAITING_PAYMENT' || row.solanaPaySignature) return;
      if (!row.solanaPayHash || !row.solanaPayExpiresAt || row.solanaPayExpiresAt.getTime() < Date.now()) {
        throw badRequest('PAYMENT_EXPIRED', 'This payment request expired. Please try again.');
      }
      try {
        const signature = input.signedTransaction ? await this.solana.submit(input.signedTransaction, row.solanaPayHash) : input.signature!;
        await this.prisma.order.update({ where: { id: orderId }, data: { solanaPaySignature: signature } });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw conflict('SIGNATURE_USED', 'This transaction belongs to another payment.');
        this.translate(err);
      }
    });
    await this.settleSolanaPayment(orderId);
    return this.get(user, orderId);
  }

  /**
   * Checks a reported USDC payment; once it landed, the deal is paid exactly as a card payment would be
   * (and a payment landing on a deal cancelled meanwhile is refunded by markPaid).
   */
  async settleSolanaPayment(orderId: string): Promise<void> {
    const row = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!row?.solanaPaySignature || !row.solanaPayHash) return;
    if (row.status !== 'AWAITING_PAYMENT' && !(row.status === 'CANCELLED' && !row.refundSignature)) return;
    const result = await this.solana.confirm(row.solanaPaySignature, row.solanaPayHash);
    if (result.state === 'confirmed') {
      await this.markPaid(orderId, null, null);
      return;
    }
    const expired = row.solanaPayExpiresAt && row.solanaPayExpiresAt.getTime() + 120_000 < Date.now();
    if (result.state === 'failed' || expired) {
      // The money never arrived: let the buyer try again.
      await this.prisma.order.updateMany({ where: { id: orderId, solanaPaySignature: row.solanaPaySignature }, data: { solanaPaySignature: null, solanaPayHash: null, solanaPayExpiresAt: null } });
      this.logger.warn({ orderId, reason: result.state === 'failed' ? result.error : 'expired' }, 'usdc payment did not land');
    }
  }

  // MARK: webhooks and disputes

  /** `charge.refunded` from the dashboard: mirror it. */
  async markRefundedExternally(paymentIntentId: string, refundId: string | null): Promise<void> {
    const row = await this.prisma.order.findUnique({ where: { stripePaymentIntentId: paymentIntentId } });
    if (!row || !orderCan(row.status, 'REFUNDED')) return;
    const updated = await this.prisma.order.update({ where: { id: row.id }, data: { status: 'REFUNDED', cancelReason: 'external_refund', refundedAt: new Date(), stripeRefundId: refundId, handoverCode: null } });
    await this.reopenListing(row.listingId);
    this.notifyBoth(updated, 'order_refunded');
  }

  /** A chargeback: freeze the deal, pull back a payout if one went out, open an incident. */
  async markDisputed(paymentIntentId: string): Promise<void> {
    const row = await this.prisma.order.findUnique({ where: { stripePaymentIntentId: paymentIntentId } });
    if (!row || !orderCan(row.status, 'DISPUTED')) return;
    if (row.stripeTransferId) {
      try {
        await this.stripe.reverseTransfer(row.stripeTransferId, `order:${row.id}:reversal`);
      } catch (err) {
        this.logger.error({ orderId: row.id, err: err instanceof Error ? err.message : String(err) }, 'stripe.reversal.failed');
      }
    }
    await this.prisma.order.update({ where: { id: row.id }, data: { status: 'DISPUTED' } });
    await this.prisma.incident.create({ data: { userId: row.payerId, kind: 'REPORT_THRESHOLD', refId: row.id } });
    this.logger.warn({ orderId: row.id }, 'market.dispute');
  }

  /** Moderator decision on a disputed or stuck deal. */
  async resolve(orderId: string, action: 'release' | 'refund'): Promise<OrderView> {
    return this.withLock(orderId, async () => {
      const row = await this.prisma.order.findUnique({ where: { id: orderId }, include: ORDER_INCLUDE });
      if (!row) throw notFound('Deal not found.');
      if (action === 'refund') {
        await this.refundLocked(orderId, 'moderator');
      } else {
        if (!orderCan(row.status, 'COMPLETED')) throw conflict('INVALID_STATE', 'This deal cannot be released.');
        if (row.paymentRail === 'STRIPE' && !(await this.connect.destinationFor(row.payeeId))) throw conflict('PAYOUTS_NOT_READY', 'The seller has no payout account.');
        try {
          const payout = await this.payOut(row);
          const updated = await this.prisma.order.update({ where: { id: orderId }, data: { status: 'COMPLETED', ...payout, completedAt: new Date(), handoverCode: null } });
          this.notifyBoth(updated, 'order_completed');
        } catch (err) {
          this.translate(err);
        }
      }
      await this.prisma.incident.updateMany({ where: { refId: orderId, status: 'OPEN' }, data: { status: 'RESOLVED' } });
      const fresh = await this.prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: ORDER_INCLUDE });
      return this.toView(fresh, fresh.payeeId);
    });
  }

  // MARK: sweeps

  /** Unpaid deals past their window are cancelled; paid ones nobody approved are refunded. */
  async sweep(now = new Date()): Promise<{ paymentTimeouts: number; autoRefunds: number }> {
    // USDC payments the app never reported back: settle them before anything times out.
    const inFlight = await this.prisma.order.findMany({
      where: {
        paymentRail: 'SOLANA_USDC',
        solanaPaySignature: { not: null },
        OR: [{ status: 'AWAITING_PAYMENT' }, { status: 'CANCELLED', refundSignature: null }],
      },
    });
    for (const row of inFlight) await this.settleSolanaPayment(row.id).catch((err) => this.logger.warn({ orderId: row.id, err: err instanceof Error ? err.message : String(err) }, 'usdc settle failed'));
    const unpaid = await this.prisma.order.findMany({ where: { status: 'AWAITING_PAYMENT', paymentDueAt: { lt: now } } });
    for (const row of unpaid) {
      await this.withLock(row.id, async () => {
        const fresh = await this.prisma.order.findUniqueOrThrow({ where: { id: row.id } });
        if (fresh.status === 'AWAITING_PAYMENT') await this.cancelLocked(fresh, 'payment_timeout');
      }).catch((err) => this.logger.error({ orderId: row.id, err: err instanceof Error ? err.message : String(err) }, 'payment timeout failed'));
    }
    const stale = await this.prisma.order.findMany({ where: { status: 'PAID', approvalDeadlineAt: { lt: now } } });
    let autoRefunds = 0;
    for (const row of stale) {
      try {
        await this.withLock(row.id, async () => {
          const fresh = await this.prisma.order.findUniqueOrThrow({ where: { id: row.id } });
          if (fresh.status === 'PAID') await this.refundLocked(fresh.id, 'auto_refund');
        });
        autoRefunds += 1;
        this.logger.log({ orderId: row.id }, 'market.auto_refund');
      } catch (err) {
        this.logger.error({ orderId: row.id, err: err instanceof Error ? err.message : String(err) }, 'auto refund failed');
      }
    }
    return { paymentTimeouts: unpaid.length, autoRefunds };
  }
}
