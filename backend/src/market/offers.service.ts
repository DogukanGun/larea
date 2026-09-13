import { Injectable, Logger } from '@nestjs/common';
import { BlocksService } from '../blocks/blocks.service.js';
import { badRequest, conflict, forbidden, notFound, unavailable, unprocessable } from '../common/errors.js';
import type { UserSnapshot } from '../common/types.js';
import { InjectEnv } from '../config/inject-env.js';
import { type Env, marketEnabled } from '../config/env.js';
import { EnforcementService } from '../enforcement/enforcement.service.js';
import { PrismaService } from '../infra/prisma/prisma.service.js';
import { MEDIA_SUMMARY_SELECT } from '../media/media.service.js';
import { ModerationService } from '../moderation/moderation.service.js';
import { ModerationUnavailableError } from '../moderation/moderation.types.js';
import { normalizeText } from '../moderation/rules.js';
import { type LocationFix, PresenceService } from '../presence/presence.service.js';
import { RealtimeBus } from '../realtime/realtime.bus.js';
import { haversineMeters } from '../venues/geo.js';
import type { CreateOfferDto } from './dto/market.dto.js';
import { LISTING_INCLUDE, ListingsService } from './listings.service.js';
import { OrdersService } from './orders.service.js';
import { StripeConnectService } from './stripe/stripe-connect.service.js';
import type { MarketConfigView, MarketMeView, OfferView } from './market.views.js';
import type { OrderView } from './orders.service.js';
import { TABLES, assertTransition } from './state-machine.js';

const OFFER_INCLUDE = {
  offerer: { select: { id: true, displayName: true } },
  order: { select: { id: true } },
  listing: { select: { id: true, ownerId: true, title: true, kind: true, priceCents: true, status: true, publicLat: true, publicLng: true, expiresAt: true, images: { orderBy: { position: 'asc' as const }, take: 1, include: { media: { select: MEDIA_SUMMARY_SELECT } } } } },
} as const;

@Injectable()
export class OffersService {
  private readonly logger = new Logger(OffersService.name);

  constructor(
    @InjectEnv() private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly listings: ListingsService,
    private readonly presence: PresenceService,
    private readonly moderation: ModerationService,
    private readonly enforcement: EnforcementService,
    private readonly blocks: BlocksService,
    private readonly bus: RealtimeBus,
    private readonly orders: OrdersService,
    private readonly connect: StripeConnectService,
  ) {}

  private get paymentsOn(): boolean {
    return marketEnabled(this.env) && this.env.MARKET_PAYMENTS_ENABLED;
  }

  /** Who pays whom for an offer on this kind of listing. */
  static parties(listing: { kind: 'OFFER' | 'REQUEST'; ownerId: string }, offererId: string): { payerId: string; payeeId: string } {
    return listing.kind === 'OFFER' ? { payerId: offererId, payeeId: listing.ownerId } : { payerId: listing.ownerId, payeeId: offererId };
  }

  config(): MarketConfigView {
    return {
      enabled: marketEnabled(this.env),
      payments: marketEnabled(this.env) && this.env.MARKET_PAYMENTS_ENABLED,
      testMode: this.env.NODE_ENV !== 'production',
      currency: this.env.MARKET_CURRENCY,
      radiusM: this.env.MARKET_RADIUS_M,
      feePercent: this.env.MARKET_FEE_PERCENT,
      feeMinCents: this.env.MARKET_FEE_MIN_CENTS,
      minPriceCents: this.env.MARKET_MIN_PRICE_CENTS,
      maxPriceCents: this.env.MARKET_MAX_PRICE_CENTS,
      maxImages: this.env.MARKET_MAX_IMAGES,
    };
  }

  /** A price proposed on someone else's listing; the caller must be within reach. */
  async create(user: UserSnapshot, listingId: string, dto: CreateOfferDto): Promise<OfferView> {
    this.listings.assertMuted(user);
    await this.listings.assertAccountOldEnough(user.id);
    this.listings.assertPriceInRange(dto.amountCents);
    const fix: LocationFix = { lat: dto.lat, lng: dto.lng, accuracy: dto.accuracy, mocked: dto.mocked };
    await this.presence.checkFix(user.id, fix);

    const listing = await this.prisma.listing.findUnique({ where: { id: listingId }, include: LISTING_INCLUDE });
    if (!listing || listing.status === 'REMOVED') throw notFound('Listing not found.');
    if ((await this.blocks.blockset(user.id)).includes(listing.ownerId)) throw notFound('Listing not found.');
    if (listing.ownerId === user.id) throw badRequest('OWN_LISTING', "You can't make an offer on your own listing.");
    if (listing.status !== 'ACTIVE' || listing.expiresAt.getTime() < Date.now()) throw conflict('INVALID_STATE', 'This listing is no longer open for offers.');
    if (haversineMeters(fix, { lat: listing.publicLat, lng: listing.publicLng }) > this.env.MARKET_RADIUS_M) {
      throw forbidden('TOO_FAR', `You need to be within ${Math.round(this.env.MARKET_RADIUS_M / 1000)} km of this listing to make an offer.`);
    }
    const existing = await this.prisma.offer.findFirst({ where: { listingId, offererId: user.id, status: 'PENDING' } });
    if (existing) throw conflict('OFFER_EXISTS', 'You already have an open offer on this listing.');
    // On a help request the helper gets paid, so they need a payout account before offering.
    if (this.paymentsOn && listing.kind === 'REQUEST' && !(await this.connect.isPayoutReady(user.id))) {
      throw forbidden('PAYOUTS_NOT_READY', 'Set up payouts before offering to help.', { action: 'stripe_onboarding' });
    }

    const note = normalizeText(dto.note ?? '');
    if (note) {
      let decision;
      try {
        decision = await this.moderation.evaluateListing({ text: note, images: [] });
      } catch (err) {
        if (err instanceof ModerationUnavailableError) throw unavailable('MODERATION_UNAVAILABLE', "We couldn't check your note. Please try again.");
        throw err;
      }
      if (decision.decision === 'block' || decision.decision === 'censor') {
        await this.enforcement.recordViolation(user.id, { listingId, severity: Math.max(1, decision.severity), categories: decision.categories });
        throw unprocessable('CONTENT_REJECTED', "This note doesn't meet our marketplace rules. Please rephrase it.");
      }
    }

    const offer = await this.prisma.offer.create({
      data: { listingId, offererId: user.id, amountCents: dto.amountCents, note: note || null, expiresAt: new Date(Date.now() + this.env.MARKET_OFFER_TTL_HOURS * 3_600_000) },
      include: OFFER_INCLUDE,
    });
    this.bus.toUser(listing.ownerId, { type: 'market_update', kind: 'offer_received', listingId, offerId: offer.id });
    this.logger.log({ offerId: offer.id, listingId }, 'offer created');
    return this.listings.offerView(offer);
  }

  /** The owner takes the offer: the listing is reserved and, with payments on, a deal is opened. */
  async accept(user: UserSnapshot, offerId: string): Promise<{ offer: OfferView; order: OrderView | null }> {
    const offer = await this.prisma.offer.findUnique({ where: { id: offerId }, include: OFFER_INCLUDE });
    if (!offer || offer.listing.ownerId !== user.id) throw notFound('Offer not found.');
    if (offer.status === 'PENDING' && offer.expiresAt.getTime() < Date.now()) throw conflict('OFFER_EXPIRED', 'This offer has expired.');
    assertTransition(TABLES.OFFER, offer.status, 'ACCEPTED', 'offer');
    if (offer.listing.status === 'RESERVED') throw conflict('LISTING_RESERVED', 'Another offer is already being completed.');
    assertTransition(TABLES.LISTING, offer.listing.status, 'RESERVED', 'listing');
    const parties = OffersService.parties(offer.listing, offer.offererId);
    if (this.paymentsOn) {
      if (!(await this.connect.isPayoutReady(parties.payeeId))) {
        throw forbidden('PAYOUTS_NOT_READY', parties.payeeId === user.id ? 'Set up payouts before accepting an offer.' : 'The helper has no payout account yet.', { action: 'stripe_onboarding' });
      }
      await this.orders.assertWithinDailyCap(parties.payerId, offer.amountCents);
      await this.orders.assertWithinDailyCap(parties.payeeId, offer.amountCents);
    }

    await this.prisma.$transaction(async (tx) => {
      const reserved = await tx.listing.updateMany({ where: { id: offer.listingId, status: 'ACTIVE' }, data: { status: 'RESERVED' } });
      if (reserved.count !== 1) throw conflict('LISTING_RESERVED', 'Another offer is already being completed.');
      const accepted = await tx.offer.updateMany({ where: { id: offerId, status: 'PENDING' }, data: { status: 'ACCEPTED', respondedAt: new Date() } });
      if (accepted.count !== 1) throw conflict('INVALID_STATE', 'This offer was already answered.');
    });
    let order: OrderView | null = null;
    if (this.paymentsOn) {
      const row = await this.orders.createForOffer({ offerId, listingId: offer.listingId, listingTitle: offer.listing.title, payerId: parties.payerId, payeeId: parties.payeeId, amountCents: offer.amountCents });
      order = this.orders.toView(row, user.id);
    }
    this.bus.toUser(offer.offererId, { type: 'market_update', kind: 'offer_accepted', listingId: offer.listingId, offerId, orderId: order?.id });
    const fresh = await this.prisma.offer.findUniqueOrThrow({ where: { id: offerId }, include: OFFER_INCLUDE });
    return { offer: this.listings.offerView(fresh), order };
  }

  async decline(user: UserSnapshot, offerId: string): Promise<OfferView> {
    const offer = await this.prisma.offer.findUnique({ where: { id: offerId }, include: OFFER_INCLUDE });
    if (!offer || offer.listing.ownerId !== user.id) throw notFound('Offer not found.');
    assertTransition(TABLES.OFFER, offer.status, 'DECLINED', 'offer');
    const updated = await this.prisma.offer.update({ where: { id: offerId }, data: { status: 'DECLINED', respondedAt: new Date() }, include: OFFER_INCLUDE });
    this.bus.toUser(offer.offererId, { type: 'market_update', kind: 'offer_declined', listingId: offer.listingId, offerId });
    return this.listings.offerView(updated);
  }

  async withdraw(user: UserSnapshot, offerId: string): Promise<OfferView> {
    const offer = await this.prisma.offer.findUnique({ where: { id: offerId }, include: OFFER_INCLUDE });
    if (!offer || offer.offererId !== user.id) throw notFound('Offer not found.');
    assertTransition(TABLES.OFFER, offer.status, 'WITHDRAWN', 'offer');
    const updated = await this.prisma.offer.update({ where: { id: offerId }, data: { status: 'WITHDRAWN', respondedAt: new Date() }, include: OFFER_INCLUDE });
    this.bus.toUser(offer.listing.ownerId, { type: 'market_update', kind: 'offer_withdrawn', listingId: offer.listingId, offerId });
    return this.listings.offerView(updated);
  }

  /** Offers nobody answered in time. */
  async expireDue(now = new Date()): Promise<number> {
    const due = await this.prisma.offer.findMany({ where: { status: 'PENDING', expiresAt: { lt: now } }, select: { id: true, listingId: true, offererId: true } });
    if (due.length === 0) return 0;
    await this.prisma.offer.updateMany({ where: { id: { in: due.map((o) => o.id) } }, data: { status: 'EXPIRED', respondedAt: now } });
    for (const o of due) this.bus.toUser(o.offererId, { type: 'market_update', kind: 'offer_expired', listingId: o.listingId, offerId: o.id });
    return due.length;
  }

  /** Everything the caller is involved in, for the Deals tab. */
  async me(user: UserSnapshot): Promise<MarketMeView> {
    const [listings, offersMade, offersReceived] = await Promise.all([
      this.prisma.listing.findMany({ where: { ownerId: user.id, status: { in: ['ACTIVE', 'RESERVED', 'SOLD'] } }, include: LISTING_INCLUDE, orderBy: { createdAt: 'desc' }, take: 100 }),
      this.prisma.offer.findMany({ where: { offererId: user.id }, include: OFFER_INCLUDE, orderBy: { createdAt: 'desc' }, take: 100 }),
      this.prisma.offer.findMany({ where: { listing: { ownerId: user.id }, status: { in: ['PENDING', 'ACCEPTED'] } }, include: OFFER_INCLUDE, orderBy: { createdAt: 'desc' }, take: 100 }),
    ]);
    const counts = await this.prisma.offer.groupBy({ by: ['listingId'], where: { listingId: { in: listings.map((l) => l.id) }, status: 'PENDING' }, _count: { _all: true } });
    const countBy = new Map(counts.map((c) => [c.listingId, c._count._all]));
    const [orders, payouts] = await Promise.all([this.orders.mine(user.id), this.connect.status(user.id)]);
    return {
      payoutsEnabled: payouts.payoutsEnabled,
      listings: listings.map((l) => this.listings.toView(l, user.id, null, { offerCount: countBy.get(l.id) ?? 0 })),
      offersMade: offersMade.map((o) => this.listings.offerView(o)),
      offersReceived: offersReceived.map((o) => this.listings.offerView(o)),
      orders,
    };
  }
}
