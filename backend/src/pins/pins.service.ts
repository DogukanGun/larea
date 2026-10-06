import { Inject, Injectable, Logger } from '@nestjs/common';
import { BlocksService } from '../blocks/blocks.service.js';
import { AppError, badRequest, conflict, forbidden, notFound, unavailable, unprocessable } from '../common/errors.js';
import type { UserSnapshot } from '../common/types.js';
import { InjectEnv } from '../config/inject-env.js';
import type { Env } from '../config/env.js';
import { EnforcementService } from '../enforcement/enforcement.service.js';
import type { Pin, PinMessage, PinRail } from '../generated/prisma/client.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../infra/prisma/prisma.service.js';
import { RedisService } from '../infra/redis/redis.service.js';
import { bboxDeltas } from '../market/market-geo.js';
import { CENSOR_NOTICE, GUIDELINES_NOTICE, WARN_NOTICE } from '../messages/messages.service.js';
import { ModerationService } from '../moderation/moderation.service.js';
import { type ModerationDecision, ModerationUnavailableError } from '../moderation/moderation.types.js';
import { normalizeText } from '../moderation/rules.js';
import { type LocationFix, PresenceService } from '../presence/presence.service.js';
import type { PinClosedReason, PinMessageView } from '../realtime/protocol.js';
import { RealtimeBus } from '../realtime/realtime.bus.js';
import { SOLANA_CLIENT, type SolanaClient, SolanaUnavailableError, TransactionMismatchError } from '../solana/solana.client.js';
import { parseUnits } from '../solana/units.js';
import { encodeGeohash } from '../venues/discovery/geohash.js';
import { haversineMeters, joinVerdict } from '../venues/geo.js';
import { GEOCODER, type Geocoder, GeocoderUnavailableError } from './geocoder.js';
import { PIN_TIERS, type PlaceAdmin, tierFor } from './pricing.js';
import { InvalidPurchaseError, STORE_VERIFIER, StoreUnavailableError, type StoreVerifier, type VerifiedPurchase } from './store-verifier.js';

const GEO_CACHE_TTL_SEC = 30 * 24 * 60 * 60;
/** ~1.2 km x 0.6 km: fine enough that a cell rarely straddles a city boundary by much. */
const GEO_CACHE_PRECISION = 6;
const HISTORY_DEFAULT = 50;

export interface PinView {
  id: string;
  text: string;
  tier: Pin['tier'];
  status: Pin['status'];
  lat: number;
  lng: number;
  owner: { id: string; displayName: string };
  /** The caller owns it and runs its chat. */
  mine: boolean;
  createdAt: string;
  expiresAt: string | null;
  editedAt: string | null;
  messageCount: number;
  /** Only with a fix: metres from it, and whether the chat can be opened from there. */
  distanceM?: number;
  eligible?: boolean;
}

export interface PinQuote {
  pin: PinView;
  tier: Pin['tier'];
  productId: string;
  priceUsd: string;
  durationHours: number;
  /** Shown in the composer ("same city: Munich"); null when unknown. */
  buyerCity: string | null;
  targetCity: string | null;
  notice?: string;
}

export interface PinSendResult {
  status: 'approved' | 'censored' | 'blocked';
  message?: PinMessageView;
  notice?: string;
}

export interface PinSolanaPayment {
  pin: PinView;
  /** Base64 transaction for the buyer's wallet to sign. */
  transaction: string;
  cluster: SolanaClient['cluster'];
  amount: string;
  token: 'USDC';
}

export type ApplePurchaseInput = { platform: 'apple'; signedTransaction: string };
export type GooglePurchaseInput = { platform: 'google'; productId: string; purchaseToken: string };
export type PurchaseInput = ApplePurchaseInput | GooglePurchaseInput;

type PinRow = Pin & { owner: { id: string; displayName: string }; _count?: { messages: number } };
type PinMessageRow = PinMessage & { author: { id: string; displayName: string } };

const PIN_INCLUDE = {
  owner: { select: { id: true, displayName: true } },
  _count: { select: { messages: { where: { status: { in: ['APPROVED', 'CENSORED'] } } } } },
} as const satisfies Prisma.PinInclude;
const MESSAGE_INCLUDE = { author: { select: { id: true, displayName: true } } } as const;

const closedMessages: Record<PinClosedReason, string> = {
  expired: 'This pin has expired.',
  removed: 'This pin is no longer available.',
  banned: 'The owner of this pin removed you from its chat.',
};

/**
 * Paid message pins: someone pins a message to any spot on the map and gets a chat under it that they
 * run. The price and lifetime depend on how far the spot is from the buyer (nearby, same city, same
 * country, elsewhere). Only people near a pin can read and write in its chat; its owner always can.
 */
@Injectable()
export class PinsService {
  private readonly logger = new Logger(PinsService.name);

  constructor(
    @InjectEnv() private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly presence: PresenceService,
    private readonly moderation: ModerationService,
    private readonly enforcement: EnforcementService,
    private readonly blocks: BlocksService,
    private readonly bus: RealtimeBus,
    @Inject(GEOCODER) private readonly geocoder: Geocoder,
    @Inject(STORE_VERIFIER) private readonly store: StoreVerifier,
    @Inject(SOLANA_CLIENT) private readonly solana: SolanaClient,
  ) {}

  // ---------------------------------------------------------------- views

  view(pin: PinRow, viewerId: string, fix?: LocationFix): PinView {
    const view: PinView = {
      id: pin.id,
      text: pin.text,
      tier: pin.tier,
      status: pin.status,
      lat: pin.lat,
      lng: pin.lng,
      owner: pin.owner,
      mine: pin.ownerId === viewerId,
      createdAt: pin.createdAt.toISOString(),
      expiresAt: pin.expiresAt?.toISOString() ?? null,
      editedAt: pin.editedAt?.toISOString() ?? null,
      messageCount: pin._count?.messages ?? 0,
    };
    if (fix) {
      const distance = haversineMeters(fix, pin);
      view.distanceM = Math.round(distance / 10) * 10;
      view.eligible = view.mine || joinVerdict(distance, fix.accuracy, { joinRadiusM: this.env.PIN_CHAT_RADIUS_M, maxAccuracyM: this.env.MAX_ACCURACY_M }) === 'ok';
    }
    return view;
  }

  messageView(m: PinMessageRow): PinMessageView {
    return {
      id: m.id,
      pinId: m.pinId,
      author: m.author,
      text: m.text,
      status: m.status === 'CENSORED' ? 'CENSORED' : 'APPROVED',
      createdAt: m.createdAt.toISOString(),
    };
  }

  private isLive(pin: Pick<Pin, 'status' | 'expiresAt'>, now = new Date()): boolean {
    return pin.status === 'ACTIVE' && !!pin.expiresAt && pin.expiresAt > now;
  }

  private async load(pinId: string): Promise<PinRow> {
    const pin = await this.prisma.pin.findUnique({ where: { id: pinId }, include: PIN_INCLUDE });
    if (!pin) throw notFound('This pin does not exist.');
    return pin;
  }

  private async loadLive(pinId: string): Promise<PinRow> {
    const pin = await this.load(pinId);
    if (!this.isLive(pin)) throw notFound('This pin is no longer on the map.');
    return pin;
  }

  private async loadOwned(userId: string, pinId: string): Promise<PinRow> {
    const pin = await this.prisma.pin.findFirst({ where: { id: pinId, ownerId: userId }, include: PIN_INCLUDE });
    if (!pin) throw notFound('This pin does not exist.');
    return pin;
  }

  // ---------------------------------------------------------------- pricing

  /** City and country of a point, cached per ~1 km cell. */
  async adminOf(lat: number, lng: number): Promise<PlaceAdmin> {
    const key = `geo:rev:${encodeGeohash(lat, lng, GEO_CACHE_PRECISION)}`;
    const cached = await this.redis.client.get(key);
    if (cached) return JSON.parse(cached) as PlaceAdmin;
    const admin = await this.geocoder.reverse(lat, lng).catch((err: unknown) => {
      if (err instanceof GeocoderUnavailableError) throw unavailable('GEOCODER_UNAVAILABLE', "We couldn't price this spot right now. Please try again.");
      throw err;
    });
    await this.redis.client.set(key, JSON.stringify(admin), 'EX', GEO_CACHE_TTL_SEC);
    return admin;
  }

  private moderate(text: string, context: string, recent: { displayName: string; text: string }[] = []): Promise<ModerationDecision> {
    return this.moderation.evaluateMessage({ text, venueName: context, recent }).catch((err: unknown) => {
      if (err instanceof ModerationUnavailableError) throw unavailable('MODERATION_UNAVAILABLE', "We couldn't check your message. Please try again.");
      throw err;
    });
  }

  private assertNotMuted(user: UserSnapshot): void {
    if (user.mutedUntil && new Date(user.mutedUntil).getTime() > Date.now()) {
      throw forbidden('MUTED', "You can't send messages right now.", { mutedUntil: user.mutedUntil });
    }
  }

  /**
   * Prices a pin and creates it unpaid. The text is moderated first, so nobody pays for a message
   * that would never be shown. The pin's id is what the store purchase must carry.
   */
  async quote(user: UserSnapshot, input: { lat: number; lng: number; text: string; fix: LocationFix }): Promise<PinQuote> {
    this.assertNotMuted(user);
    const text = normalizeText(input.text);
    if (!text) throw badRequest('VALIDATION', 'Write a message to pin.');
    await this.presence.checkFix(user.id, input.fix);

    const target = { lat: input.lat, lng: input.lng };
    const nearby = haversineMeters(input.fix, target) <= this.env.PIN_NEARBY_RADIUS_M;
    const [buyerAdmin, targetAdmin] = nearby ? [null, null] : await Promise.all([this.adminOf(input.fix.lat, input.fix.lng), this.adminOf(target.lat, target.lng)]);
    const tier = tierFor(input.fix, target, this.env.PIN_NEARBY_RADIUS_M, buyerAdmin, targetAdmin);
    const info = PIN_TIERS[tier];

    const context = targetAdmin?.cityName ? `a message pinned on the map in ${targetAdmin.cityName}` : 'a message pinned on the map';
    const decision = await this.moderate(text, context);
    if (decision.decision === 'block') {
      await this.enforcement.recordViolation(user.id, { severity: Math.max(2, decision.severity), categories: decision.categories });
      throw unprocessable('PIN_TEXT_REJECTED', GUIDELINES_NOTICE);
    }
    const censored = decision.decision === 'censor' && decision.censoredText ? normalizeText(decision.censoredText) || text : null;
    if (decision.decision !== 'allow') {
      await this.enforcement.recordViolation(user.id, { severity: Math.max(1, decision.severity), categories: decision.categories });
    }

    const pin = await this.prisma.pin.create({
      data: {
        ownerId: user.id,
        lat: target.lat,
        lng: target.lng,
        text: censored ?? text,
        originalText: censored ? text : null,
        severity: decision.severity,
        categories: decision.categories,
        tier,
        productId: info.productId,
        buyerLat: input.fix.lat,
        buyerLng: input.fix.lng,
      },
      include: PIN_INCLUDE,
    });
    return {
      pin: this.view(pin, user.id),
      tier,
      productId: info.productId,
      priceUsd: info.priceUsd,
      durationHours: info.durationHours,
      buyerCity: buyerAdmin?.cityName ?? null,
      targetCity: targetAdmin?.cityName ?? null,
      notice: censored ? CENSOR_NOTICE : decision.decision === 'warn' ? WARN_NOTICE : undefined,
    };
  }

  // ---------------------------------------------------------------- payment

  private async verify(input: PurchaseInput): Promise<VerifiedPurchase> {
    try {
      return input.platform === 'apple'
        ? await this.store.verifyApple(input.signedTransaction)
        : await this.store.verifyGoogle(input.productId, input.purchaseToken);
    } catch (err) {
      if (err instanceof InvalidPurchaseError) throw badRequest('PURCHASE_INVALID', "We couldn't confirm this purchase.", { detail: err.message });
      if (err instanceof StoreUnavailableError) throw unavailable('STORE_UNAVAILABLE', "We couldn't reach the store. Your purchase is safe; we'll retry.");
      throw err;
    }
  }

  /**
   * Activates a pin with a store purchase. Idempotent: reporting the same transaction again returns the
   * pin, so the app can retry until it gets an answer and only then finish the transaction.
   */
  async purchase(user: UserSnapshot, pinId: string, input: PurchaseInput, now = new Date()): Promise<PinView> {
    const pin = await this.loadOwned(user.id, pinId);
    const purchase = await this.verify(input);
    if (purchase.accountToken !== pin.id.toLowerCase()) throw badRequest('PURCHASE_MISMATCH', 'This purchase was made for a different pin.');
    if (purchase.productId !== pin.productId) throw badRequest('PURCHASE_MISMATCH', 'This purchase is for a different price tier.');
    if (purchase.revoked) throw badRequest('PURCHASE_REVOKED', 'This purchase was refunded.');

    const existing = await this.prisma.pinPurchase.findUnique({ where: { platform_transactionId: { platform: purchase.platform, transactionId: purchase.transactionId } } });
    if (existing) {
      if (existing.pinId !== pin.id) throw conflict('PURCHASE_USED', 'This purchase already paid for another pin.');
      return this.view(await this.load(pin.id), user.id);
    }
    if (pin.status !== 'PENDING_PAYMENT') throw conflict('PIN_ALREADY_PAID', 'This pin is already paid for.');

    const activated = await this.activate(pin, purchase.platform, now, (tx) =>
      tx.pinPurchase.create({
        data: {
          pinId: pin.id,
          platform: purchase.platform,
          transactionId: purchase.transactionId,
          originalTransactionId: purchase.originalTransactionId,
          productId: purchase.productId,
          environment: purchase.environment,
          raw: purchase.raw as Prisma.InputJsonValue,
        },
      }),
    );
    if (input.platform === 'google') {
      // Consuming also acknowledges; Play refunds purchases left unacknowledged for three days.
      await this.store.consumeGoogle(input.productId, input.purchaseToken).catch((err: unknown) => this.logger.error({ err, pinId: pin.id }, 'consuming a Play purchase failed'));
    }
    this.logger.log({ pinId: pin.id, tier: pin.tier, platform: purchase.platform, environment: purchase.environment }, 'pin purchased');
    return this.view(activated, user.id);
  }

  /** PENDING_PAYMENT → ACTIVE exactly once; the lifetime starts at payment. */
  private async activate(pin: Pin, rail: PinRail, now: Date, record?: (tx: Prisma.TransactionClient) => Promise<unknown>): Promise<PinRow> {
    const expiresAt = new Date(now.getTime() + PIN_TIERS[pin.tier].durationHours * 3600_000);
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (record) await record(tx);
        const updated = await tx.pin.updateMany({ where: { id: pin.id, status: 'PENDING_PAYMENT' }, data: { status: 'ACTIVE', rail, paidAt: now, expiresAt } });
        if (updated.count === 0) throw conflict('PIN_ALREADY_PAID', 'This pin is already paid for.');
        return tx.pin.findUniqueOrThrow({ where: { id: pin.id }, include: PIN_INCLUDE });
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw conflict('PURCHASE_USED', 'This purchase already paid for another pin.');
      throw err;
    }
  }

  private chainCall<T>(call: Promise<T>): Promise<T> {
    return call.catch((error: unknown) => {
      if (error instanceof SolanaUnavailableError) throw unavailable('SOLANA_UNAVAILABLE', 'Solana is not reachable right now.');
      throw error;
    });
  }

  /** dApp Store build: the same price in USDC, sent from the buyer's wallet to Larea's escrow wallet. */
  async solanaPay(user: UserSnapshot, pinId: string): Promise<PinSolanaPayment> {
    const pin = await this.loadOwned(user.id, pinId);
    if (pin.status !== 'PENDING_PAYMENT') throw conflict('PIN_ALREADY_PAID', 'This pin is already paid for.');
    const wallet = await this.prisma.wallet.findUnique({ where: { userId: user.id } });
    if (!wallet) throw conflict('WALLET_REQUIRED', 'Connect a wallet in your profile to pay with USDC.');
    const treasury = this.solana.custodyAddress('escrow');
    if (!treasury) throw unavailable('SOLANA_UNAVAILABLE', 'USDC payments are not set up yet.');
    const info = PIN_TIERS[pin.tier];
    const prepared = await this.chainCall(
      this.solana.buildTransfer({ from: wallet.address, to: treasury, token: 'USDC', amount: parseUnits(info.priceUsd)!, memo: `larea:pin:${pin.id}` }),
    );
    const updated = await this.prisma.pin.update({ where: { id: pin.id }, data: { messageHash: prepared.messageHash, signature: null }, include: PIN_INCLUDE });
    return { pin: this.view(updated, user.id), transaction: prepared.transaction, cluster: this.solana.cluster, amount: info.priceUsd, token: 'USDC' };
  }

  async solanaSubmit(user: UserSnapshot, pinId: string, signedTransaction: string): Promise<PinView> {
    const pin = await this.loadOwned(user.id, pinId);
    if (pin.status !== 'PENDING_PAYMENT') return this.view(pin, user.id);
    if (!pin.signature) {
      if (!pin.messageHash) throw badRequest('NO_PAYMENT', 'Start the USDC payment first.');
      const signature = await this.chainCall(this.solana.submit(signedTransaction, pin.messageHash)).catch((error: unknown) => {
        if (error instanceof TransactionMismatchError) throw badRequest('TRANSACTION_MISMATCH', 'The signed transaction is not the one Larea prepared.');
        throw error;
      });
      try {
        await this.prisma.pin.update({ where: { id: pin.id }, data: { signature } });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw conflict('SIGNATURE_USED', 'This transaction belongs to another payment.');
        throw error;
      }
      pin.signature = signature;
    }
    return this.view(await this.settleSolana(pin), user.id);
  }

  private async settleSolana(pin: PinRow, now = new Date()): Promise<PinRow> {
    if (!pin.signature || !pin.messageHash) return pin;
    const result = await this.chainCall(this.solana.confirm(pin.signature, pin.messageHash));
    if (result.state === 'confirmed') {
      // Already activated by the app or the sweeper: just return the current state.
      return this.activate(pin, 'SOLANA_USDC', now).catch((err: unknown) => {
        if (err instanceof AppError) return this.load(pin.id);
        throw err;
      });
    }
    if (result.state === 'failed') {
      this.logger.warn({ pinId: pin.id, error: result.error }, 'pin USDC payment failed');
      return this.prisma.pin.update({ where: { id: pin.id }, data: { signature: null, messageHash: null }, include: PIN_INCLUDE });
    }
    return pin;
  }

  // ---------------------------------------------------------------- reading

  /** Live pins in the map viewport, newest first; pins by people the caller blocked are left out. */
  async nearby(user: UserSnapshot, q: LocationFix & { viewLat?: number; viewLng?: number; viewRadiusM?: number }, now = new Date()): Promise<PinView[]> {
    const center = q.viewLat !== undefined && q.viewLng !== undefined ? { lat: q.viewLat, lng: q.viewLng } : q;
    const radius = Math.max(500, q.viewRadiusM ?? this.env.DISCOVERY_RADIUS_M);
    const { dLat, dLng } = bboxDeltas(center.lat, radius);
    const excluded = await this.blocks.blockset(user.id);
    const rows = await this.prisma.pin.findMany({
      where: {
        status: 'ACTIVE',
        expiresAt: { gt: now },
        ownerId: { notIn: excluded },
        lat: { gte: center.lat - dLat, lte: center.lat + dLat },
        lng: { gte: center.lng - dLng, lte: center.lng + dLng },
        bans: { none: { userId: user.id } },
      },
      orderBy: { paidAt: 'desc' },
      take: this.env.PIN_MAX_PER_MAP,
      include: PIN_INCLUDE,
    });
    return rows.map((p) => this.view(p, user.id, q));
  }

  async get(user: UserSnapshot, pinId: string, fix?: LocationFix): Promise<PinView> {
    const pin = await this.load(pinId);
    if (pin.ownerId !== user.id && (!this.isLive(pin) || (await this.blocks.blockset(user.id)).includes(pin.ownerId))) throw notFound('This pin is no longer on the map.');
    return this.view(pin, user.id, fix);
  }

  /** The caller's own pins, including unpaid quotes (for recovering a purchase). */
  async mine(user: UserSnapshot): Promise<PinView[]> {
    const rows = await this.prisma.pin.findMany({
      where: { ownerId: user.id, status: { in: ['PENDING_PAYMENT', 'ACTIVE', 'EXPIRED'] } },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: PIN_INCLUDE,
    });
    return rows.map((p) => this.view(p, user.id));
  }

  /** Why someone cannot be in this pin's chat right now, or null when they can. */
  async chatBarrier(userId: string, pin: PinRow, fix?: LocationFix): Promise<{ code: string; message: string } | null> {
    if (!this.isLive(pin)) return { code: 'PIN_CLOSED', message: 'This pin is no longer on the map.' };
    if (pin.ownerId === userId) return null;
    if (await this.prisma.pinBan.findUnique({ where: { pinId_userId: { pinId: pin.id, userId } } })) return { code: 'PIN_BANNED', message: closedMessages.banned };
    if ((await this.blocks.blockset(userId)).includes(pin.ownerId)) return { code: 'PIN_CLOSED', message: 'This pin is no longer on the map.' };
    if (!fix) return { code: 'PIN_TOO_FAR', message: 'Get closer to this pin to join its chat.' };
    await this.presence.checkFix(userId, fix);
    const verdict = joinVerdict(haversineMeters(fix, pin), fix.accuracy, { joinRadiusM: this.env.PIN_CHAT_RADIUS_M, maxAccuracyM: this.env.MAX_ACCURACY_M });
    return verdict === 'ok' ? null : { code: 'PIN_TOO_FAR', message: 'Get closer to this pin to join its chat.' };
  }

  private async assertInChat(userId: string, pin: PinRow, fix?: LocationFix): Promise<void> {
    const barrier = await this.chatBarrier(userId, pin, fix);
    if (barrier) throw forbidden(barrier.code, barrier.message);
  }

  /** For the realtime subscription: same rules as reading over HTTP. */
  async canFollow(userId: string, pinId: string, fix: LocationFix): Promise<{ ok: true } | { ok: false; reason: string }> {
    const pin = await this.prisma.pin.findUnique({ where: { id: pinId }, include: PIN_INCLUDE });
    if (!pin) return { ok: false, reason: 'not_found' };
    try {
      const barrier = await this.chatBarrier(userId, pin, fix);
      return barrier ? { ok: false, reason: barrier.code.toLowerCase() } : { ok: true };
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code) return { ok: false, reason: code.toLowerCase() };
      throw err;
    }
  }

  async history(user: UserSnapshot, pinId: string, q: { fix?: LocationFix; afterId?: string; limit?: number }): Promise<PinMessageView[]> {
    const pin = await this.load(pinId);
    await this.assertInChat(user.id, pin, q.fix);
    const excluded = await this.blocks.blockset(user.id);
    const where: Prisma.PinMessageWhereInput = { pinId, status: { in: ['APPROVED', 'CENSORED'] }, authorId: { notIn: excluded } };
    const limit = q.limit ?? HISTORY_DEFAULT;
    if (q.afterId) {
      const anchor = await this.prisma.pinMessage.findUnique({ where: { id: q.afterId }, select: { createdAt: true, pinId: true } });
      if (!anchor || anchor.pinId !== pinId) throw notFound('Unknown message.');
      const rows = await this.prisma.pinMessage.findMany({ where: { ...where, createdAt: { gt: anchor.createdAt } }, orderBy: { createdAt: 'asc' }, take: limit, include: MESSAGE_INCLUDE });
      return rows.map((m) => this.messageView(m));
    }
    const rows = await this.prisma.pinMessage.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit, include: MESSAGE_INCLUDE });
    return rows.reverse().map((m) => this.messageView(m));
  }

  // ---------------------------------------------------------------- writing

  async send(user: UserSnapshot, pinId: string, input: { text: string; clientKey: string; fix?: LocationFix }): Promise<PinSendResult> {
    const existing = await this.prisma.pinMessage.findUnique({ where: { authorId_clientKey: { authorId: user.id, clientKey: input.clientKey } }, include: MESSAGE_INCLUDE });
    if (existing) return this.sendResult(existing);
    this.assertNotMuted(user);
    const text = normalizeText(input.text);
    if (!text) throw badRequest('VALIDATION', 'Message cannot be empty.');
    const pin = await this.load(pinId);
    await this.assertInChat(user.id, pin, input.fix);

    const recentRows = await this.prisma.pinMessage.findMany({
      where: { pinId, status: { in: ['APPROVED', 'CENSORED'] } },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: MESSAGE_INCLUDE,
    });
    const recent = [{ displayName: pin.owner.displayName, text: pin.text }, ...recentRows.reverse().map((m) => ({ displayName: m.author.displayName, text: m.text }))];
    const decision = await this.moderate(text, `the chat under a pinned message: "${pin.text}"`, recent);
    const status = decision.decision === 'block' ? 'BLOCKED' : decision.decision === 'censor' && decision.censoredText ? 'CENSORED' : 'APPROVED';
    const shown = status === 'CENSORED' ? normalizeText(decision.censoredText!) || text : text;

    let message: PinMessageRow;
    try {
      message = await this.prisma.pinMessage.create({
        data: {
          pinId,
          authorId: user.id,
          text: shown,
          originalText: status === 'APPROVED' ? null : text,
          status,
          severity: decision.severity,
          categories: decision.categories,
          moderationReason: decision.reason,
          clientKey: input.clientKey,
        },
        include: MESSAGE_INCLUDE,
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return this.sendResult(await this.prisma.pinMessage.findUniqueOrThrow({ where: { authorId_clientKey: { authorId: user.id, clientKey: input.clientKey } }, include: MESSAGE_INCLUDE }));
      }
      throw err;
    }
    const severity = status === 'BLOCKED' ? Math.max(2, decision.severity) : decision.decision === 'allow' ? 0 : Math.max(1, decision.severity);
    if (severity > 0) await this.enforcement.recordViolation(user.id, { messageId: message.id, severity, categories: decision.categories });
    if (status !== 'BLOCKED') this.bus.toPin(pinId, { type: 'pin_message', message: this.messageView(message) }, await this.blocks.blockset(user.id));
    return this.sendResult(message, decision);
  }

  private sendResult(m: PinMessageRow, decision?: ModerationDecision): PinSendResult {
    if (m.status === 'BLOCKED' || m.status === 'HIDDEN') return { status: 'blocked', notice: GUIDELINES_NOTICE };
    if (m.status === 'CENSORED') return { status: 'censored', message: this.messageView(m), notice: CENSOR_NOTICE };
    return { status: 'approved', message: this.messageView(m), notice: decision?.decision === 'warn' ? WARN_NOTICE : undefined };
  }

  // ---------------------------------------------------------------- owner tools

  async edit(user: UserSnapshot, pinId: string, rawText: string): Promise<PinView> {
    this.assertNotMuted(user);
    const pin = await this.loadOwned(user.id, pinId);
    if (!this.isLive(pin) && pin.status !== 'PENDING_PAYMENT') throw conflict('PIN_CLOSED', 'This pin is no longer on the map.');
    const text = normalizeText(rawText);
    if (!text) throw badRequest('VALIDATION', 'Write a message to pin.');
    const decision = await this.moderate(text, 'a message pinned on the map');
    if (decision.decision === 'block') {
      await this.enforcement.recordViolation(user.id, { pinId, severity: Math.max(2, decision.severity), categories: decision.categories });
      throw unprocessable('PIN_TEXT_REJECTED', GUIDELINES_NOTICE);
    }
    const censored = decision.decision === 'censor' && decision.censoredText ? normalizeText(decision.censoredText) || text : null;
    const now = new Date();
    const updated = await this.prisma.pin.update({
      where: { id: pin.id },
      data: { text: censored ?? text, originalText: censored ? text : null, severity: decision.severity, categories: decision.categories, editedAt: now },
      include: PIN_INCLUDE,
    });
    if (this.isLive(updated)) this.bus.toPin(pin.id, { type: 'pin_updated', pinId: pin.id, text: updated.text, editedAt: now.toISOString() });
    return this.view(updated, user.id);
  }

  async ownerHide(user: UserSnapshot, pinId: string, messageId: string): Promise<void> {
    await this.loadOwned(user.id, pinId);
    const message = await this.prisma.pinMessage.findFirst({ where: { id: messageId, pinId } });
    if (!message) throw notFound('Message not found.');
    await this.hideMessage(messageId);
  }

  /** Hides a pin message for everyone (owner, moderator or report threshold). */
  async hideMessage(messageId: string): Promise<boolean> {
    const updated = await this.prisma.pinMessage.updateManyAndReturn({ where: { id: messageId, status: { in: ['APPROVED', 'CENSORED'] } }, data: { status: 'HIDDEN' } });
    if (updated.length === 0) return false;
    this.bus.toPin(updated[0].pinId, { type: 'pin_message_hidden', pinId: updated[0].pinId, messageId });
    return true;
  }

  async ban(user: UserSnapshot, pinId: string, userId: string): Promise<void> {
    await this.loadOwned(user.id, pinId);
    if (userId === user.id) throw badRequest('VALIDATION', "You can't remove yourself.");
    const target = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!target) throw notFound('User not found.');
    await this.prisma.pinBan.upsert({ where: { pinId_userId: { pinId, userId } }, update: {}, create: { pinId, userId } });
    this.bus.closePin(pinId, { type: 'pin_closed', pinId, reason: 'banned', message: closedMessages.banned }, userId);
  }

  async unban(user: UserSnapshot, pinId: string, userId: string): Promise<void> {
    await this.loadOwned(user.id, pinId);
    await this.prisma.pinBan.deleteMany({ where: { pinId, userId } });
  }

  async bans(user: UserSnapshot, pinId: string): Promise<{ id: string; displayName: string; bannedAt: string }[]> {
    await this.loadOwned(user.id, pinId);
    const rows = await this.prisma.pinBan.findMany({ where: { pinId }, include: { user: { select: { id: true, displayName: true } } }, orderBy: { createdAt: 'desc' } });
    return rows.map((b) => ({ id: b.user.id, displayName: b.user.displayName, bannedAt: b.createdAt.toISOString() }));
  }

  // ---------------------------------------------------------------- moderation and lifecycle

  /** Takes a pin off the map (moderator, reports or a store refund). */
  async remove(pinId: string, why: 'moderator' | 'reports' | 'refund'): Promise<boolean> {
    const updated = await this.prisma.pin.updateMany({ where: { id: pinId, status: { in: ['ACTIVE', 'PENDING_PAYMENT'] } }, data: { status: 'REMOVED', closedAt: new Date() } });
    if (updated.count === 0) return false;
    this.logger.log({ pinId, why }, 'pin removed');
    this.bus.closePin(pinId, { type: 'pin_closed', pinId, reason: 'removed', message: closedMessages.removed });
    return true;
  }

  /** App Store Server Notifications v2: a refunded or revoked purchase takes its pin down. */
  async appleNotification(signedPayload: string): Promise<{ handled: boolean }> {
    let n;
    try {
      n = await this.store.decodeAppleNotification(signedPayload);
    } catch (err) {
      if (err instanceof InvalidPurchaseError) throw badRequest('NOTIFICATION_INVALID', 'Bad notification signature.');
      if (err instanceof StoreUnavailableError) throw unavailable('STORE_UNAVAILABLE', 'App Store verification is not configured.');
      throw err;
    }
    if (!['REFUND', 'REVOKE'].includes(n.type) || !n.transactionId) return { handled: false };
    return { handled: await this.revoke('APPLE', n.transactionId) };
  }

  private async revoke(platform: 'APPLE' | 'GOOGLE', transactionId: string): Promise<boolean> {
    const purchase = await this.prisma.pinPurchase.findUnique({ where: { platform_transactionId: { platform, transactionId } } });
    if (!purchase || purchase.revokedAt) return false;
    await this.prisma.pinPurchase.update({ where: { id: purchase.id }, data: { revokedAt: new Date() } });
    await this.remove(purchase.pinId, 'refund');
    return true;
  }

  /** Expired pins close; old unpaid quotes go; USDC payments in flight are settled; Play refunds are applied. */
  async sweep(now = new Date()): Promise<{ expired: number; purged: number; settled: number; refunded: number }> {
    const due = await this.prisma.pin.findMany({ where: { status: 'ACTIVE', expiresAt: { lte: now } }, select: { id: true }, take: 500 });
    let expired = 0;
    for (const { id } of due) {
      const updated = await this.prisma.pin.updateMany({ where: { id, status: 'ACTIVE' }, data: { status: 'EXPIRED', closedAt: now } });
      if (updated.count === 0) continue;
      expired++;
      this.bus.closePin(id, { type: 'pin_closed', pinId: id, reason: 'expired', message: closedMessages.expired });
    }
    const purged = await this.prisma.pin.deleteMany({
      where: { status: 'PENDING_PAYMENT', signature: null, createdAt: { lt: new Date(now.getTime() - this.env.PIN_PENDING_TTL_DAYS * 86_400_000) } },
    });

    let settled = 0;
    const inFlight = await this.prisma.pin.findMany({ where: { status: 'PENDING_PAYMENT', signature: { not: null } }, include: PIN_INCLUDE, take: 100 });
    for (const pin of inFlight) {
      const after = await this.settleSolana(pin, now).catch((err: unknown) => {
        this.logger.warn({ err, pinId: pin.id }, 'settling a USDC pin payment failed');
        return pin;
      });
      if (after.status === 'ACTIVE') settled++;
    }

    let refunded = 0;
    const voided = await this.store.voidedGoogleTokens(now.getTime() - 7 * 86_400_000).catch((err: unknown) => {
      this.logger.warn({ err }, 'reading voided Play purchases failed');
      return [] as string[];
    });
    for (const token of voided) if (await this.revoke('GOOGLE', token)) refunded++;

    return { expired, purged: purged.count, settled, refunded };
  }
}
