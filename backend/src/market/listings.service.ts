import { Injectable, Logger } from '@nestjs/common';
import { BlocksService } from '../blocks/blocks.service.js';
import { badRequest, conflict, forbidden, notFound, unavailable, unprocessable } from '../common/errors.js';
import type { UserSnapshot } from '../common/types.js';
import { InjectEnv } from '../config/inject-env.js';
import type { Env } from '../config/env.js';
import { EnforcementService } from '../enforcement/enforcement.service.js';
import type { Listing, ListingImage, Media, Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../infra/prisma/prisma.service.js';
import { MEDIA_SUMMARY_SELECT, MediaService, type MediaSummary } from '../media/media.service.js';
import { ModerationService } from '../moderation/moderation.service.js';
import { type ModerationDecision, type ModerationImage, ModerationUnavailableError } from '../moderation/moderation.types.js';
import { normalizeText } from '../moderation/rules.js';
import { type LocationFix, PresenceService } from '../presence/presence.service.js';
import type { MarketUpdateKind } from '../realtime/protocol.js';
import { RealtimeBus } from '../realtime/realtime.bus.js';
import { haversineMeters, type LatLng } from '../venues/geo.js';
import type { CreateListingDto, ListingFeedQueryDto, UpdateListingDto } from './dto/market.dto.js';
import { bboxDeltas, roundDistance, snapPosition } from './market-geo.js';
import type { ListingDetailView, ListingView, OfferView } from './market.views.js';
import { TABLES, assertTransition, listingCan } from './state-machine.js';

export const LISTING_INCLUDE = {
  owner: { select: { id: true, displayName: true } },
  images: { orderBy: { position: 'asc' as const }, include: { media: { select: MEDIA_SUMMARY_SELECT } } },
} as const;

export type ListingRow = Listing & {
  owner: { id: string; displayName: string };
  images: (ListingImage & { media: MediaSummary })[];
};

export const CONTENT_REJECTED_NOTICE = "This listing doesn't meet our marketplace rules. Please rephrase it or choose other photos.";
const WARN_NOTICE = 'Please keep it respectful. Repeated issues can limit your ability to use the marketplace.';

@Injectable()
export class ListingsService {
  private readonly logger = new Logger(ListingsService.name);

  constructor(
    @InjectEnv() private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly presence: PresenceService,
    private readonly media: MediaService,
    private readonly moderation: ModerationService,
    private readonly enforcement: EnforcementService,
    private readonly blocks: BlocksService,
    private readonly bus: RealtimeBus,
  ) {}

  // MARK: views

  toView(row: ListingRow, viewerId: string, fix?: LatLng | null, extras: { offerCount?: number } = {}): ListingView {
    const location = { lat: row.publicLat, lng: row.publicLng, approximate: true as const };
    const view: ListingView = {
      id: row.id,
      kind: row.kind,
      category: row.category,
      title: row.title,
      description: row.description,
      priceCents: row.priceCents,
      currency: row.currency,
      paymentRail: row.paymentRail,
      status: row.status,
      owner: row.owner,
      mine: row.ownerId === viewerId,
      images: row.images.map((i) => this.media.toView(i.media)).filter((v): v is NonNullable<typeof v> => v !== null),
      location,
      distanceM: fix ? roundDistance(haversineMeters(fix, location)) : null,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
    };
    if (view.mine && extras.offerCount !== undefined) view.offerCount = extras.offerCount;
    return view;
  }

  offerView(o: { id: string; listingId: string; offererId: string; amountCents: number; note: string | null; status: string; expiresAt: Date; respondedAt: Date | null; createdAt: Date; offerer: { id: string; displayName: string }; listing: { id: string; title: string; kind: 'OFFER' | 'REQUEST'; priceCents: number; status: string; images?: { media: MediaSummary }[] }; order?: { id: string } | null }): OfferView {
    const thumb = o.listing.images?.[0] ? this.media.toView(o.listing.images[0].media)?.thumbUrl ?? null : null;
    const orderId = o.order?.id ?? null;
    return {
      id: o.id,
      listingId: o.listingId,
      listing: { id: o.listing.id, title: o.listing.title, kind: o.listing.kind, priceCents: o.listing.priceCents, thumbUrl: thumb, status: o.listing.status },
      offerer: o.offerer,
      amountCents: o.amountCents,
      note: o.note,
      status: o.status,
      expiresAt: o.expiresAt.toISOString(),
      respondedAt: o.respondedAt?.toISOString() ?? null,
      orderId,
      createdAt: o.createdAt.toISOString(),
    };
  }

  // MARK: guards shared with offers

  /** Throwaway accounts cannot trade; the age is measured from registration. */
  async assertAccountOldEnough(userId: string): Promise<void> {
    if (this.env.MARKET_MIN_ACCOUNT_AGE_HOURS <= 0) return;
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { createdAt: true } });
    const ageHours = user ? (Date.now() - user.createdAt.getTime()) / 3_600_000 : 0;
    if (ageHours < this.env.MARKET_MIN_ACCOUNT_AGE_HOURS) {
      throw forbidden('ACCOUNT_TOO_NEW', `New accounts can use the marketplace after ${this.env.MARKET_MIN_ACCOUNT_AGE_HOURS} hours.`);
    }
  }

  assertPriceInRange(cents: number): void {
    if (cents < this.env.MARKET_MIN_PRICE_CENTS || cents > this.env.MARKET_MAX_PRICE_CENTS) {
      throw badRequest('VALIDATION', `Prices must be between ${this.env.MARKET_MIN_PRICE_CENTS / 100} and ${this.env.MARKET_MAX_PRICE_CENTS / 100} ${this.env.MARKET_CURRENCY.toUpperCase()}.`);
    }
  }

  assertMuted(user: UserSnapshot): void {
    if (user.mutedUntil && new Date(user.mutedUntil).getTime() > Date.now()) {
      throw forbidden('MUTED', "You can't use the marketplace right now.", { mutedUntil: user.mutedUntil });
    }
  }

  /** Text plus photos through the classifier; blocked content is never stored. */
  private async moderate(text: string, uploads: Media[]): Promise<ModerationDecision> {
    const images: ModerationImage[] = [];
    for (const m of uploads) images.push({ data: await this.media.renditionForModeration(m.id), mimeType: 'image/jpeg' });
    try {
      return await this.moderation.evaluateListing({ text, images });
    } catch (err) {
      if (err instanceof ModerationUnavailableError) throw unavailable('MODERATION_UNAVAILABLE', "We couldn't check your listing. Please try again.");
      throw err;
    }
  }

  private async rejectContent(userId: string, uploads: Media[], decision: ModerationDecision): Promise<never> {
    for (const m of uploads) await this.media.reject(m.id);
    await this.enforcement.recordViolation(userId, { severity: Math.max(1, decision.severity), categories: decision.categories });
    throw unprocessable('CONTENT_REJECTED', CONTENT_REJECTED_NOTICE, { notice: CONTENT_REJECTED_NOTICE });
  }

  // MARK: create / read / update

  /** Listings from the Solana build are paid in USDC when the owner has a wallet to receive it. */
  private async railFor(userId: string, build?: string): Promise<{ paymentRail: 'STRIPE' | 'SOLANA_USDC'; currency: string }> {
    if (build === 'solana' && this.env.SOLANA_ENABLED && (await this.prisma.wallet.findUnique({ where: { userId } }))) {
      return { paymentRail: 'SOLANA_USDC', currency: 'usdc' };
    }
    return { paymentRail: 'STRIPE', currency: this.env.MARKET_CURRENCY };
  }

  async create(user: UserSnapshot, dto: CreateListingDto, build?: string): Promise<ListingDetailView & { notice?: string }> {
    this.assertMuted(user);
    await this.assertAccountOldEnough(user.id);
    this.assertPriceInRange(dto.priceCents);
    const mediaIds = dto.mediaIds ?? [];
    if (mediaIds.length > this.env.MARKET_MAX_IMAGES) throw badRequest('VALIDATION', `At most ${this.env.MARKET_MAX_IMAGES} photos per listing.`);
    const fix: LocationFix = { lat: dto.lat, lng: dto.lng, accuracy: dto.accuracy, mocked: dto.mocked };
    await this.presence.checkFix(user.id, fix);

    const title = normalizeText(dto.title);
    const description = normalizeText(dto.description ?? '');
    if (title.length < 3) throw badRequest('VALIDATION', 'Titles need at least 3 characters.');
    const uploads: Media[] = [];
    for (const id of mediaIds) uploads.push(await this.media.findUploaded(id, user.id));

    const decision = await this.moderate(`${title}\n${description}`, uploads);
    if (decision.decision === 'block' || decision.decision === 'censor') await this.rejectContent(user.id, uploads, decision);

    const snapped = snapPosition(fix);
    const expiresAt = new Date(Date.now() + this.env.MARKET_LISTING_TTL_DAYS * 86_400_000);
    for (const m of uploads) await this.media.claim(m.id, user.id);
    const row = await this.prisma.listing.create({
      data: {
        ownerId: user.id,
        kind: dto.kind,
        category: dto.category,
        title,
        description,
        priceCents: dto.priceCents,
        ...(await this.railFor(user.id, build)),
        lat: fix.lat,
        lng: fix.lng,
        geohash7: snapped.geohash,
        publicLat: snapped.lat,
        publicLng: snapped.lng,
        severity: decision.severity,
        categories: decision.categories,
        moderationReason: decision.reason,
        expiresAt,
        images: { create: uploads.map((m, position) => ({ mediaId: m.id, position })) },
      },
      include: LISTING_INCLUDE,
    });
    if (decision.severity > 0) await this.enforcement.recordViolation(user.id, { listingId: row.id, severity: Math.max(1, decision.severity), categories: decision.categories });
    this.logger.log({ listingId: row.id, kind: row.kind }, 'listing created');
    const view: ListingDetailView & { notice?: string } = { ...this.toView(row, user.id, fix, { offerCount: 0 }), myOffer: null, offers: [] };
    if (decision.decision === 'warn') view.notice = WARN_NOTICE;
    return view;
  }

  async feed(user: UserSnapshot, query: ListingFeedQueryDto): Promise<{ listings: ListingView[]; nextOffset: number | null; radiusM: number }> {
    const radiusM = Math.min(query.radiusM ?? this.env.MARKET_RADIUS_M, this.env.MARKET_RADIUS_M);
    const fix = { lat: query.lat, lng: query.lng };
    const { dLat, dLng } = bboxDeltas(fix.lat, radiusM);
    const excluded = await this.blocks.blockset(user.id);
    const where: Prisma.ListingWhereInput = {
      status: 'ACTIVE',
      expiresAt: { gt: new Date() },
      publicLat: { gte: fix.lat - dLat, lte: fix.lat + dLat },
      publicLng: { gte: fix.lng - dLng, lte: fix.lng + dLng },
      ownerId: { notIn: excluded },
      owner: { suspendedAt: null, deletedAt: null },
      ...(query.kind ? { kind: query.kind } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.minPriceCents !== undefined || query.maxPriceCents !== undefined
        ? { priceCents: { ...(query.minPriceCents !== undefined ? { gte: query.minPriceCents } : {}), ...(query.maxPriceCents !== undefined ? { lte: query.maxPriceCents } : {}) } }
        : {}),
      ...(query.q?.trim() ? { title: { contains: query.q.trim(), mode: 'insensitive' } } : {}),
    };
    const rows = await this.prisma.listing.findMany({ where, include: LISTING_INCLUDE, take: this.env.MARKET_MAX_LISTINGS * 2, orderBy: { createdAt: 'desc' } });
    const within = rows
      .map((row) => ({ row, distance: haversineMeters(fix, { lat: row.publicLat, lng: row.publicLng }) }))
      .filter((x) => x.distance <= radiusM);
    const sort = query.sort ?? 'distance';
    within.sort((a, b) => {
      if (sort === 'newest') return b.row.createdAt.getTime() - a.row.createdAt.getTime();
      if (sort === 'price') return a.row.priceCents - b.row.priceCents || a.distance - b.distance;
      return a.distance - b.distance || b.row.createdAt.getTime() - a.row.createdAt.getTime();
    });
    const capped = within.slice(0, this.env.MARKET_MAX_LISTINGS);
    const offset = query.offset ?? 0;
    const limit = query.limit ?? 50;
    const page = capped.slice(offset, offset + limit);
    return {
      listings: page.map(({ row }) => this.toView(row, user.id, fix)),
      nextOffset: offset + limit < capped.length ? offset + limit : null,
      radiusM,
    };
  }

  /** Loads a listing the viewer may see: owner, an offerer, or someone within reach with a fix. */
  async get(user: UserSnapshot, id: string, fix?: LatLng | null): Promise<ListingDetailView> {
    const row = await this.prisma.listing.findUnique({ where: { id }, include: LISTING_INCLUDE });
    if (!row) throw notFound('Listing not found.');
    const mine = row.ownerId === user.id;
    const myOffers = await this.prisma.offer.findMany({
      where: { listingId: id, offererId: user.id },
      orderBy: { createdAt: 'desc' },
      include: { offerer: { select: { id: true, displayName: true } }, listing: { select: { id: true, title: true, kind: true, priceCents: true, status: true, images: { orderBy: { position: 'asc' }, take: 1, include: { media: { select: MEDIA_SUMMARY_SELECT } } } } } },
    });
    const party = mine || myOffers.length > 0;
    if (!party) {
      if (row.status === 'REMOVED' || row.status === 'CANCELLED' || row.status === 'EXPIRED') throw notFound('Listing not found.');
      if ((await this.blocks.blockset(user.id)).includes(row.ownerId)) throw notFound('Listing not found.');
      const location = { lat: row.publicLat, lng: row.publicLng };
      if (!fix || haversineMeters(fix, location) > this.env.MARKET_RADIUS_M) {
        throw forbidden('TOO_FAR', `Listings are only visible within ${Math.round(this.env.MARKET_RADIUS_M / 1000)} km.`);
      }
    }
    const offerCount = mine ? await this.prisma.offer.count({ where: { listingId: id, status: 'PENDING' } }) : undefined;
    const view: ListingDetailView = { ...this.toView(row, user.id, fix, { offerCount }), myOffer: myOffers[0] ? this.offerView(myOffers[0]) : null };
    if (mine) {
      const pending = await this.prisma.offer.findMany({
        where: { listingId: id, status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
        include: { offerer: { select: { id: true, displayName: true } }, listing: { select: { id: true, title: true, kind: true, priceCents: true, status: true } } },
      });
      view.offers = pending.map((o) => this.offerView(o));
    }
    return view;
  }

  async update(user: UserSnapshot, id: string, dto: UpdateListingDto): Promise<ListingDetailView & { notice?: string }> {
    this.assertMuted(user);
    const row = await this.prisma.listing.findUnique({ where: { id }, include: LISTING_INCLUDE });
    if (!row || row.ownerId !== user.id) throw notFound('Listing not found.');
    if (row.status !== 'ACTIVE') throw conflict('INVALID_STATE', 'Only active listings can be edited.');
    if (dto.priceCents !== undefined) this.assertPriceInRange(dto.priceCents);
    const title = dto.title !== undefined ? normalizeText(dto.title) : row.title;
    const description = dto.description !== undefined ? normalizeText(dto.description) : row.description;
    if (title.length < 3) throw badRequest('VALIDATION', 'Titles need at least 3 characters.');

    const keepIds = new Set(row.images.map((i) => i.mediaId));
    const wanted = dto.mediaIds ?? row.images.map((i) => i.mediaId);
    if (wanted.length > this.env.MARKET_MAX_IMAGES) throw badRequest('VALIDATION', `At most ${this.env.MARKET_MAX_IMAGES} photos per listing.`);
    const newUploads: Media[] = [];
    for (const mediaId of wanted) if (!keepIds.has(mediaId)) newUploads.push(await this.media.findUploaded(mediaId, user.id));

    const decision = await this.moderate(`${title}\n${description}`, newUploads.length || dto.title !== undefined || dto.description !== undefined ? newUploads : []);
    if (decision.decision === 'block' || decision.decision === 'censor') await this.rejectContent(user.id, newUploads, decision);

    for (const m of newUploads) await this.media.claim(m.id, user.id);
    const dropped = row.images.filter((i) => !wanted.includes(i.mediaId)).map((i) => i.mediaId);
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.listingImage.deleteMany({ where: { listingId: id } });
      return tx.listing.update({
        where: { id },
        data: {
          title,
          description,
          category: dto.category ?? row.category,
          priceCents: dto.priceCents ?? row.priceCents,
          severity: Math.max(row.severity, decision.severity),
          images: { create: wanted.map((mediaId, position) => ({ mediaId, position })) },
        },
        include: LISTING_INCLUDE,
      });
    });
    await this.media.purge(dropped);
    const view: ListingDetailView & { notice?: string } = { ...this.toView(updated, user.id, null), myOffer: null };
    if (decision.decision === 'warn') view.notice = WARN_NOTICE;
    return view;
  }

  // MARK: lifecycle

  async cancel(user: UserSnapshot, id: string): Promise<ListingView> {
    const row = await this.prisma.listing.findUnique({ where: { id }, include: LISTING_INCLUDE });
    if (!row || row.ownerId !== user.id) throw notFound('Listing not found.');
    if (row.status === 'RESERVED') throw conflict('LISTING_RESERVED', 'Finish or cancel the current deal first.');
    assertTransition(TABLES.LISTING, row.status, 'CANCELLED', 'listing');
    const updated = await this.prisma.listing.update({ where: { id }, data: { status: 'CANCELLED' }, include: LISTING_INCLUDE });
    await this.declinePending(id, 'offer_declined');
    return this.toView(updated, user.id, null);
  }

  /** The owner finished the deal outside the app's payment flow (payments off) or after payment. */
  async markSold(user: UserSnapshot, id: string): Promise<ListingView> {
    const row = await this.prisma.listing.findUnique({ where: { id }, include: LISTING_INCLUDE });
    if (!row || row.ownerId !== user.id) throw notFound('Listing not found.');
    assertTransition(TABLES.LISTING, row.status, 'SOLD', 'listing');
    const updated = await this.prisma.listing.update({ where: { id }, data: { status: 'SOLD' }, include: LISTING_INCLUDE });
    await this.declinePending(id, 'offer_declined');
    return this.toView(updated, user.id, null);
  }

  /** Reports or a moderator take the listing down; photos leave the public directory. */
  async remove(id: string, by: 'reports' | 'moderator'): Promise<boolean> {
    const row = await this.prisma.listing.findUnique({ where: { id }, include: { images: true } });
    if (!row || !listingCan(row.status, 'REMOVED')) return false;
    await this.prisma.listing.update({ where: { id }, data: { status: 'REMOVED', removedAt: new Date() } });
    for (const image of row.images) await this.media.quarantine(image.mediaId);
    await this.declinePending(id, 'offer_declined');
    this.bus.toUser(row.ownerId, { type: 'market_update', kind: 'listing_removed', listingId: id });
    this.logger.log({ listingId: id, by }, 'listing removed');
    return true;
  }

  /** Listings past their lifetime; offers on them close too. */
  async expireDue(now = new Date()): Promise<number> {
    const due = await this.prisma.listing.findMany({ where: { status: 'ACTIVE', expiresAt: { lt: now } }, select: { id: true, ownerId: true } });
    for (const listing of due) {
      await this.prisma.listing.update({ where: { id: listing.id }, data: { status: 'EXPIRED' } });
      await this.declinePending(listing.id, 'offer_expired');
      this.bus.toUser(listing.ownerId, { type: 'market_update', kind: 'listing_expired', listingId: listing.id });
    }
    return due.length;
  }

  /** Closed listings older than the purge window disappear with their photos, unless a report or incident refers to them. */
  async purgeClosed(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - this.env.MARKET_LISTING_PURGE_DAYS * 86_400_000);
    const flagged = (await this.prisma.incident.findMany({ where: { refId: { not: null } }, select: { refId: true } })).map((i) => i.refId!);
    const rows = await this.prisma.listing.findMany({
      where: { status: { in: ['CANCELLED', 'EXPIRED', 'REMOVED', 'SOLD'] }, updatedAt: { lt: cutoff }, reports: { none: {} }, id: { notIn: flagged }, orders: { none: {} } },
      select: { id: true, images: { select: { mediaId: true } } },
      take: 200,
    });
    for (const row of rows) {
      await this.prisma.listing.delete({ where: { id: row.id } });
      await this.media.purge(row.images.map((i) => i.mediaId));
    }
    return rows.length;
  }

  private async declinePending(listingId: string, kind: MarketUpdateKind): Promise<void> {
    const pending = await this.prisma.offer.findMany({ where: { listingId, status: 'PENDING' }, select: { id: true, offererId: true } });
    if (pending.length === 0) return;
    const status = kind === 'offer_expired' ? 'EXPIRED' : 'DECLINED';
    await this.prisma.offer.updateMany({ where: { id: { in: pending.map((o) => o.id) } }, data: { status, respondedAt: new Date() } });
    for (const o of pending) this.bus.toUser(o.offererId, { type: 'market_update', kind, listingId, offerId: o.id });
  }
}
