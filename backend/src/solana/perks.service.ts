import { Inject, Injectable, Logger } from '@nestjs/common';
import { badRequest, conflict, forbidden, notFound, unavailable } from '../common/errors.js';
import { Prisma, type Perk, type PerkKind } from '../generated/prisma/client.js';
import { PrismaService } from '../infra/prisma/prisma.service.js';
import { LEGEND, levelName, VISITOR } from '../loyalty/levels.js';
import { LoyaltyService } from '../loyalty/loyalty.service.js';
import { SOLANA_CLIENT, type SolanaClient, SolanaUnavailableError } from './solana.client.js';
import { formatUnits, parseUnits } from './units.js';

export interface PerkView {
  id: string;
  venueId: string;
  kind: PerkKind;
  title: string;
  description: string;
  minLevel: number;
  minLevelName: string;
  /** SKR_DROP: whole SKR per holder. */
  amount: string | null;
  startsAt: string;
  endsAt: string;
  /** For the viewer: their level is high enough. */
  eligible?: boolean;
  /** For the viewer: they already claimed this drop. */
  claimed?: boolean;
  /** Moderators: how many claimed, out of maxClaims. */
  claims?: number;
  maxClaims?: number | null;
  cancelled?: boolean;
}

export interface CreatePerkInput {
  venueId: string;
  kind: PerkKind;
  title: string;
  description?: string;
  minLevel: number;
  amount?: string;
  maxClaims?: number;
  startsAt?: string;
  endsAt: string;
}

/**
 * Perks moderators run at a place for holders of a loyalty level: a NOTICE (a discount at the counter,
 * a meetup) or an SKR_DROP that each holder claims once from the rewards wallet.
 */
@Injectable()
export class PerksService {
  private readonly logger = new Logger(PerksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly loyalty: LoyaltyService,
    @Inject(SOLANA_CLIENT) private readonly solana: SolanaClient,
  ) {}

  private view(perk: Perk): PerkView {
    return {
      id: perk.id,
      venueId: perk.venueId,
      kind: perk.kind,
      title: perk.title,
      description: perk.description,
      minLevel: perk.minLevel,
      minLevelName: levelName(perk.minLevel),
      amount: perk.amountPerHolder !== null ? formatUnits(perk.amountPerHolder) : null,
      startsAt: perk.startsAt.toISOString(),
      endsAt: perk.endsAt.toISOString(),
    };
  }

  // Moderators

  async create(moderatorId: string, input: CreatePerkInput, now = new Date()): Promise<PerkView> {
    const venue = await this.prisma.venue.findUnique({ where: { id: input.venueId } });
    if (!venue) throw notFound('Place not found.');
    if (input.minLevel < VISITOR || input.minLevel > LEGEND) throw badRequest('VALIDATION', `minLevel goes from ${VISITOR} to ${LEGEND}.`);
    const startsAt = input.startsAt ? new Date(input.startsAt) : now;
    const endsAt = new Date(input.endsAt);
    if (!(endsAt > startsAt) || endsAt <= now) throw badRequest('VALIDATION', 'A perk has to end in the future, after it starts.');
    let amountPerHolder: bigint | null = null;
    if (input.kind === 'SKR_DROP') {
      amountPerHolder = input.amount ? parseUnits(input.amount) : null;
      if (!amountPerHolder || amountPerHolder <= 0n) throw badRequest('VALIDATION', 'An SKR drop needs an amount per holder.');
    }
    const perk = await this.prisma.perk.create({
      data: {
        venueId: input.venueId,
        createdById: moderatorId,
        kind: input.kind,
        title: input.title.trim(),
        description: input.description?.trim() ?? '',
        minLevel: input.minLevel,
        amountPerHolder,
        maxClaims: input.maxClaims ?? null,
        startsAt,
        endsAt,
      },
    });
    this.logger.log({ perkId: perk.id, venueId: perk.venueId, kind: perk.kind, moderatorId }, 'perk created');
    return this.view(perk);
  }

  async list(venueId?: string): Promise<PerkView[]> {
    const perks = await this.prisma.perk.findMany({
      where: venueId ? { venueId } : {},
      include: { _count: { select: { claims: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return perks.map((p) => ({ ...this.view(p), claims: p._count.claims, maxClaims: p.maxClaims, cancelled: !!p.cancelledAt }));
  }

  async cancel(perkId: string): Promise<void> {
    const updated = await this.prisma.perk.updateMany({ where: { id: perkId, cancelledAt: null }, data: { cancelledAt: new Date() } });
    if (updated.count === 0 && !(await this.prisma.perk.findUnique({ where: { id: perkId } }))) throw notFound('Perk not found.');
  }

  // Holders

  private activeWhere(now: Date): Prisma.PerkWhereInput {
    return { cancelledAt: null, startsAt: { lte: now }, endsAt: { gt: now } };
  }

  /** Running perks at a place, marked with whether the viewer's level reaches them. */
  async atVenue(userId: string, venueId: string, now = new Date()): Promise<PerkView[]> {
    const [perks, level] = await Promise.all([
      this.prisma.perk.findMany({ where: { venueId, ...this.activeWhere(now) }, orderBy: { endsAt: 'asc' } }),
      this.loyalty.level(userId, venueId),
    ]);
    const claimed = new Set(
      (await this.prisma.perkClaim.findMany({ where: { userId, perkId: { in: perks.map((p) => p.id) } }, select: { perkId: true } })).map((c) => c.perkId),
    );
    return perks.map((p) => ({ ...this.view(p), eligible: level >= p.minLevel, claimed: claimed.has(p.id) }));
  }

  /** Claims an SKR drop: once per holder, while it runs and has claims left. */
  async claim(userId: string, perkId: string, now = new Date()): Promise<PerkView & { signature: string | null }> {
    const perk = await this.prisma.perk.findFirst({ where: { id: perkId, ...this.activeWhere(now) } });
    if (!perk) throw notFound('This perk is not running.');
    if (perk.kind !== 'SKR_DROP' || !perk.amountPerHolder) throw badRequest('NOT_CLAIMABLE', 'There is nothing to claim for this perk.');
    if ((await this.loyalty.level(userId, perk.venueId)) < perk.minLevel) {
      throw forbidden('LEVEL_REQUIRED', `This drop is for ${levelName(perk.minLevel)}s and up at this place.`, { requiredLevel: perk.minLevel });
    }
    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) throw conflict('WALLET_REQUIRED', 'Connect a wallet to receive SKR.');
    if (await this.prisma.perkClaim.findUnique({ where: { perkId_userId: { perkId, userId } } })) {
      throw conflict('ALREADY_CLAIMED', 'You already claimed this drop.');
    }

    let claimId: string;
    try {
      claimId = await this.prisma.$transaction(async (tx) => {
        if (perk.maxClaims !== null && (await tx.perkClaim.count({ where: { perkId } })) >= perk.maxClaims) {
          throw conflict('DROP_EMPTY', 'This drop has been fully claimed.');
        }
        return (await tx.perkClaim.create({ data: { perkId, userId, wallet: wallet.address, amount: perk.amountPerHolder! } })).id;
      }, { isolationLevel: 'Serializable' });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === 'P2002' || error.code === 'P2034')) {
        const existing = await this.prisma.perkClaim.findUnique({ where: { perkId_userId: { perkId, userId } } });
        if (existing) throw conflict('ALREADY_CLAIMED', 'You already claimed this drop.');
        throw conflict('BUSY', 'Lots of people are claiming right now. Please try again.');
      }
      throw error;
    }
    const signature = await this.pay(claimId);
    return { ...this.view(perk), eligible: true, claimed: true, signature };
  }

  private async pay(claimId: string): Promise<string | null> {
    const claim = await this.prisma.perkClaim.findUniqueOrThrow({ where: { id: claimId } });
    if (claim.status === 'SENT') return claim.signature;
    try {
      const signature = await this.solana.sendFromCustody({ wallet: 'rewards', to: claim.wallet, token: 'SKR', amount: claim.amount, memo: `larea:drop:${claim.id}` });
      await this.prisma.perkClaim.update({ where: { id: claim.id }, data: { status: 'SENT', signature, sentAt: new Date(), error: null, attempts: { increment: 1 } } });
      return signature;
    } catch (error) {
      const attempts = claim.attempts + 1;
      await this.prisma.perkClaim.update({
        where: { id: claim.id },
        data: { attempts, status: attempts >= 5 ? 'FAILED' : 'PENDING', error: (error instanceof Error ? error.message : String(error)).slice(0, 500) },
      });
      if (error instanceof SolanaUnavailableError) throw unavailable('SOLANA_UNAVAILABLE', 'Solana is not reachable right now. Your claim is saved and will be paid.');
      this.logger.warn({ claimId, err: error }, 'drop payout failed; will retry');
      return null;
    }
  }

  /** Retries claims whose payout did not go through. */
  async sweep(): Promise<number> {
    const due = await this.prisma.perkClaim.findMany({ where: { status: 'PENDING' }, orderBy: { createdAt: 'asc' }, take: 50, select: { id: true } });
    for (const c of due) await this.pay(c.id).catch(() => null);
    return due.length;
  }
}
