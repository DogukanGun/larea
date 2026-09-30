import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { badRequest, conflict, notFound, unavailable } from '../common/errors.js';
import { InjectEnv } from '../config/inject-env.js';
import type { Env } from '../config/env.js';
import { Prisma, type Stamp } from '../generated/prisma/client.js';
import { PrismaService } from '../infra/prisma/prisma.service.js';
import { type LocationFix, PresenceService } from '../presence/presence.service.js';
import { VenuesService } from '../venues/venues.service.js';
import { SOLANA_CLIENT, type SolanaClient, SolanaUnavailableError, TransactionMismatchError } from './solana.client.js';

/** Bubblegum caps a name at 32 bytes. */
const NAME_MAX_BYTES = 32;
/** How long a check-in keeps the chat open. */
export const STAMP_UNLOCK_MS = 24 * 3600 * 1000;

export interface StampView {
  id: string;
  venueId: string;
  venueName: string;
  day: string;
  visit: number;
  status: Stamp['status'];
  signature: string | null;
  assetId: string | null;
  error: string | null;
  createdAt: string;
  confirmedAt: string | null;
  /** Until when this stamp opens the place's chat (confirmed stamps only). */
  unlocksUntil: string | null;
  /** Whether the DAS index shows the asset in the wallet; null when no DAS RPC is configured. */
  onChain?: boolean | null;
}

export interface CheckinResult {
  stamp: StampView;
  /** Base64 transaction for the wallet to sign; Larea has already signed as tree authority. */
  transaction: string;
  cluster: SolanaClient['cluster'];
}

export interface VenueStampStatus {
  /** A confirmed stamp from the last 24 h: the chat is open for the Solana build. */
  unlocked: boolean;
  unlocksUntil: string | null;
  checkedInToday: boolean;
  visits: number;
  pending: StampView | null;
}

/** Cuts a UTF-8 string to at most `max` bytes without splitting a character. */
export function truncateBytes(text: string, max: number): string {
  let out = '';
  for (const ch of text) {
    if (Buffer.byteLength(out + ch) > max) break;
    out += ch;
  }
  return out;
}

export function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

type StampWithVenue = Stamp & { venue: { name: string } };

/**
 * Check-in stamps: proof of presence minted as a soulbound compressed NFT. The backend checks the
 * location, builds the mint co-signed as tree authority with the user's wallet paying the fee, and
 * marks the stamp confirmed once the transaction it built lands.
 */
@Injectable()
export class StampsService {
  private readonly logger = new Logger(StampsService.name);

  constructor(
    @InjectEnv() private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly presence: PresenceService,
    private readonly venues: VenuesService,
    @Inject(SOLANA_CLIENT) private readonly solana: SolanaClient,
  ) {}

  private get metadataBase(): string {
    return (this.env.SOLANA_METADATA_URL ?? `${this.env.PUBLIC_URL}/solana/metadata`).replace(/\/$/, '');
  }

  private chainCall<T>(call: Promise<T>): Promise<T> {
    return call.catch((error: unknown) => {
      if (error instanceof SolanaUnavailableError) throw unavailable('SOLANA_UNAVAILABLE', 'Solana is not reachable right now.');
      throw error;
    });
  }

  async checkin(userId: string, venueId: string, fix: LocationFix, now = new Date()): Promise<CheckinResult> {
    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) throw conflict('WALLET_REQUIRED', 'Connect a wallet in your profile to collect stamps.');
    const venue = await this.venues.getActive(venueId);
    await this.presence.assertAtVenue(userId, venue, fix);

    const day = utcDay(now);
    const today = await this.prisma.stamp.findMany({ where: { userId, venueId, day, status: { in: ['CONFIRMED', 'PENDING'] } } });
    if (today.some((s) => s.status === 'CONFIRMED')) throw conflict('ALREADY_STAMPED', 'You already have today’s stamp for this place.');
    if (today.some((s) => s.signature && s.expiresAt > now)) {
      throw conflict('CHECKIN_PENDING', 'Your check-in is still being confirmed. Give it a moment.');
    }
    // An unsigned earlier attempt is replaced by this one.
    await this.prisma.stamp.updateMany({
      where: { userId, venueId, status: 'PENDING', signature: null },
      data: { status: 'FAILED', error: 'replaced' },
    });

    const visit = (await this.prisma.stamp.count({ where: { userId, venueId, status: 'CONFIRMED' } })) + 1;
    const id = randomUUID();
    const prepared = await this.chainCall(
      this.solana.buildStampMint({
        owner: wallet.address,
        name: truncateBytes(`${venue.name} · ${visit}`, NAME_MAX_BYTES),
        uri: `${this.metadataBase}/stamps/${id}.json`,
      }),
    );
    const stamp = await this.prisma.stamp.create({
      data: {
        id,
        userId,
        venueId,
        wallet: wallet.address,
        day,
        visit,
        messageHash: prepared.messageHash,
        expiresAt: new Date(now.getTime() + this.env.SOLANA_PENDING_TTL_SEC * 1000),
      },
      include: { venue: { select: { name: true } } },
    });
    this.logger.log({ userId, venueId, stampId: id, visit }, 'check-in prepared');
    return { stamp: this.view(stamp), transaction: prepared.transaction, cluster: this.solana.cluster };
  }

  private async pendingOf(userId: string, stampId: string): Promise<StampWithVenue> {
    const stamp = await this.prisma.stamp.findFirst({ where: { id: stampId, userId }, include: { venue: { select: { name: true } } } });
    if (!stamp) throw notFound('This check-in does not exist.');
    return stamp;
  }

  /** The wallet only signed (a local validator the wallet cannot reach): Larea sends it. */
  async submit(userId: string, stampId: string, signedTransaction: string): Promise<StampView> {
    const stamp = await this.pendingOf(userId, stampId);
    if (stamp.status !== 'PENDING') return this.view(stamp);
    if (stamp.signature) return this.settle(stamp);
    if (stamp.expiresAt <= new Date()) throw badRequest('CHECKIN_EXPIRED', 'This check-in expired. Please check in again.');
    const signature = await this.chainCall(this.solana.submit(signedTransaction, stamp.messageHash)).catch((error: unknown) => {
      if (error instanceof TransactionMismatchError) throw badRequest('TRANSACTION_MISMATCH', 'The signed transaction is not the one Larea prepared.');
      throw error;
    });
    return this.settle(await this.withSignature(stamp, signature));
  }

  /** The wallet signed and sent it (the usual MWA path): record the signature and check it. */
  async confirm(userId: string, stampId: string, signature: string): Promise<StampView> {
    const stamp = await this.pendingOf(userId, stampId);
    if (stamp.status !== 'PENDING') return this.view(stamp);
    if (stamp.signature && stamp.signature !== signature) throw conflict('SIGNATURE_MISMATCH', 'This check-in already has a different transaction.');
    return this.settle(stamp.signature ? stamp : await this.withSignature(stamp, signature));
  }

  private async withSignature(stamp: StampWithVenue, signature: string): Promise<StampWithVenue> {
    try {
      return await this.prisma.stamp.update({ where: { id: stamp.id }, data: { signature }, include: { venue: { select: { name: true } } } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw conflict('SIGNATURE_USED', 'This transaction belongs to another check-in.');
      }
      throw error;
    }
  }

  /** Asks the cluster about the stamp's transaction and records the outcome. */
  private async settle(stamp: StampWithVenue, now = new Date()): Promise<StampView> {
    if (!stamp.signature) return this.view(stamp);
    const result = await this.chainCall(this.solana.confirm(stamp.signature, stamp.messageHash)).catch((error: unknown) => {
      if (error instanceof Error && !(error instanceof SolanaUnavailableError)) {
        this.logger.warn({ err: error, stampId: stamp.id }, 'confirm failed; will retry');
        return { state: 'pending' as const };
      }
      throw error;
    });
    if (result.state === 'pending') {
      // A blockhash is long dead by the expiry, so a transaction not seen by then never lands.
      if (stamp.expiresAt.getTime() + 120_000 < now.getTime()) return this.fail(stamp, 'not confirmed in time');
      return this.view(stamp);
    }
    if (result.state === 'failed') return this.fail(stamp, result.error);
    const [asset] = result.minted;
    try {
      const updated = await this.prisma.stamp.update({
        where: { id: stamp.id },
        data: { status: 'CONFIRMED', assetId: asset?.assetId ?? null, leafIndex: asset?.leafIndex ?? null, confirmedAt: now, error: null },
        include: { venue: { select: { name: true } } },
      });
      this.logger.log({ stampId: stamp.id, assetId: asset?.assetId }, 'stamp confirmed');
      return this.view(updated);
    } catch (error) {
      // One confirmed stamp per place per day: a second one that landed anyway stays a plain asset.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return this.fail(stamp, 'already stamped today');
      throw error;
    }
  }

  private async fail(stamp: StampWithVenue, error: string): Promise<StampView> {
    const updated = await this.prisma.stamp.update({
      where: { id: stamp.id },
      data: { status: 'FAILED', error: error.slice(0, 500) },
      include: { venue: { select: { name: true } } },
    });
    return this.view(updated);
  }

  /** The user's confirmed stamps, newest first, cross-checked with the DAS index when configured. */
  async list(userId: string): Promise<{ stamps: StampView[]; dasChecked: boolean }> {
    const [stamps, wallet] = await Promise.all([
      this.prisma.stamp.findMany({
        where: { userId, status: 'CONFIRMED' },
        include: { venue: { select: { name: true } } },
        orderBy: { confirmedAt: 'desc' },
        take: 200,
      }),
      this.prisma.wallet.findUnique({ where: { userId } }),
    ]);
    const owned = wallet
      ? await this.solana.assetsByOwner(wallet.address).catch((error: unknown) => {
          this.logger.warn({ err: error }, 'DAS lookup failed');
          return null;
        })
      : null;
    const assets = owned ? new Set(owned) : null;
    return {
      stamps: stamps.map((s) => ({ ...this.view(s), onChain: assets && s.assetId ? assets.has(s.assetId) && s.wallet === wallet?.address : null })),
      dasChecked: assets !== null,
    };
  }

  async venueStatus(userId: string, venueId: string, now = new Date()): Promise<VenueStampStatus> {
    const [latest, visits, pending] = await Promise.all([
      this.prisma.stamp.findFirst({ where: { userId, venueId, status: 'CONFIRMED' }, orderBy: { confirmedAt: 'desc' } }),
      this.prisma.stamp.count({ where: { userId, venueId, status: 'CONFIRMED' } }),
      this.prisma.stamp.findFirst({
        where: { userId, venueId, status: 'PENDING', expiresAt: { gt: now } },
        include: { venue: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    const until = latest?.confirmedAt ? new Date(latest.confirmedAt.getTime() + STAMP_UNLOCK_MS) : null;
    return {
      unlocked: !!until && until > now,
      unlocksUntil: until && until > now ? until.toISOString() : null,
      checkedInToday: latest?.day === utcDay(now),
      visits,
      pending: pending ? this.view(pending) : null,
    };
  }

  /** Public metadata for a stamp's `uri`; only confirmed or pending stamps have any. */
  async metadata(stampId: string): Promise<Record<string, unknown>> {
    const stamp = await this.prisma.stamp.findUnique({ where: { id: stampId }, include: { venue: true } });
    if (!stamp || stamp.status === 'FAILED') throw notFound();
    return {
      name: truncateBytes(`${stamp.venue.name} · ${stamp.visit}`, NAME_MAX_BYTES),
      symbol: 'LAREA',
      description: `Checked in at ${stamp.venue.name} on ${stamp.day}. Visit ${stamp.visit}. Non-transferable.`,
      image: `${this.metadataBase}/stamps/${stamp.id}.svg`,
      external_url: this.env.PUBLIC_URL,
      attributes: [
        { trait_type: 'Place', value: stamp.venue.name },
        { trait_type: 'Category', value: stamp.venue.category },
        { trait_type: 'Date', value: stamp.day },
        { trait_type: 'Visit', value: stamp.visit },
      ],
      properties: { category: 'image', files: [{ uri: `${this.metadataBase}/stamps/${stamp.id}.svg`, type: 'image/svg+xml' }] },
    };
  }

  async image(stampId: string): Promise<string> {
    const stamp = await this.prisma.stamp.findUnique({ where: { id: stampId }, include: { venue: { select: { name: true } } } });
    if (!stamp || stamp.status === 'FAILED') throw notFound();
    return stampSvg(stamp.venue.name, stamp.day, stamp.visit);
  }

  /** Confirms signed stamps that were left pending and fails the ones that ran out. */
  async sweep(now = new Date()): Promise<{ confirmed: number; failed: number }> {
    const pending = await this.prisma.stamp.findMany({
      where: { status: 'PENDING', OR: [{ signature: { not: null } }, { expiresAt: { lte: now } }] },
      include: { venue: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    let confirmed = 0;
    let failed = 0;
    for (const stamp of pending) {
      const view = stamp.signature
        ? await this.settle(stamp, now).catch((error: unknown) => {
            this.logger.warn({ err: error, stampId: stamp.id }, 'sweep confirm failed');
            return null;
          })
        : await this.fail(stamp, 'expired before signing');
      if (view?.status === 'CONFIRMED') confirmed++;
      if (view?.status === 'FAILED') failed++;
    }
    return { confirmed, failed };
  }

  view(stamp: StampWithVenue): StampView {
    const until = stamp.confirmedAt ? new Date(stamp.confirmedAt.getTime() + STAMP_UNLOCK_MS) : null;
    return {
      id: stamp.id,
      venueId: stamp.venueId,
      venueName: stamp.venue.name,
      day: stamp.day,
      visit: stamp.visit,
      status: stamp.status,
      signature: stamp.signature,
      assetId: stamp.assetId,
      error: stamp.error,
      createdAt: stamp.createdAt.toISOString(),
      confirmedAt: stamp.confirmedAt?.toISOString() ?? null,
      unlocksUntil: until?.toISOString() ?? null,
    };
  }
}

const escapeXml = (text: string): string => text.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** The stamp's picture: a round passport stamp in Larea colours. */
export function stampSvg(place: string, day: string, visit: number): string {
  const name = escapeXml(place.length > 24 ? `${place.slice(0, 23)}…` : place);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
<rect width="512" height="512" fill="#FFF7EC"/>
<circle cx="256" cy="256" r="200" fill="none" stroke="#FF5A36" stroke-width="16"/>
<circle cx="256" cy="256" r="172" fill="none" stroke="#FF5A36" stroke-width="4" stroke-dasharray="10 8"/>
<text x="256" y="190" font-family="Helvetica, Arial, sans-serif" font-size="30" font-weight="700" fill="#FF5A36" text-anchor="middle" letter-spacing="6">LAREA</text>
<text x="256" y="262" font-family="Helvetica, Arial, sans-serif" font-size="34" font-weight="800" fill="#1C1B1F" text-anchor="middle">${name}</text>
<text x="256" y="312" font-family="Helvetica, Arial, sans-serif" font-size="26" fill="#1C1B1F" text-anchor="middle">${escapeXml(day)}</text>
<text x="256" y="362" font-family="Helvetica, Arial, sans-serif" font-size="24" font-weight="700" fill="#FF5A36" text-anchor="middle">VISIT ${visit}</text>
</svg>`;
}

/** The collection's own metadata (name, image) for wallets and explorers. */
export function collectionMetadata(base: string, kind: 'stamps' | 'levels'): Record<string, unknown> {
  const name = kind === 'stamps' ? 'Larea Stamps' : 'Larea Levels';
  return {
    name,
    symbol: 'LAREA',
    description:
      kind === 'stamps'
        ? 'Proof of presence: one stamp for each day you checked in at a place on Larea. Non-transferable.'
        : 'Loyalty levels earned by coming back to a place on Larea. Non-transferable.',
    image: `${base}/${kind}.svg`,
  };
}
