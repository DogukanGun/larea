import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectEnv } from '../config/inject-env.js';
import type { Env } from '../config/env.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../infra/prisma/prisma.service.js';
import { levelName } from '../loyalty/levels.js';
import { SOLANA_CLIENT, type SolanaClient } from './solana.client.js';
import { formatUnits, parseUnits } from './units.js';

/** Payouts are retried by the sweeper up to this many times. */
const MAX_ATTEMPTS = 5;

export interface RewardView {
  id: string;
  venueId: string;
  venueName: string;
  level: number;
  levelName: string;
  amount: string;
  status: 'PENDING' | 'SENT' | 'FAILED';
  signature: string | null;
  createdAt: string;
}

/**
 * SKR for coming back: reaching a loyalty level at a place pays SKR_LEVEL_REWARD from the rewards
 * wallet to the wallet that holds the stamp. Larea signs and pays the fee; each level pays once.
 */
@Injectable()
export class RewardsService {
  private readonly logger = new Logger(RewardsService.name);

  constructor(
    @InjectEnv() private readonly env: Env,
    private readonly prisma: PrismaService,
    @Inject(SOLANA_CLIENT) private readonly solana: SolanaClient,
  ) {}

  private get amount(): bigint {
    return parseUnits(String(this.env.SKR_LEVEL_REWARD)) ?? 0n;
  }

  /** Called when a stamp that minted a level badge is confirmed. Never throws: a failed payout is retried. */
  async grantLevel(stamp: { id: string; userId: string; venueId: string; wallet: string; levelMinted: number | null }): Promise<void> {
    if (!stamp.levelMinted || this.amount <= 0n) return;
    try {
      const reward = await this.prisma.loyaltyReward.create({
        data: { userId: stamp.userId, venueId: stamp.venueId, level: stamp.levelMinted, stampId: stamp.id, wallet: stamp.wallet, amount: this.amount },
      });
      await this.send(reward.id);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return; // already granted
      this.logger.error({ err: error, stampId: stamp.id }, 'level reward failed');
    }
  }

  private async send(rewardId: string): Promise<void> {
    const reward = await this.prisma.loyaltyReward.findUniqueOrThrow({ where: { id: rewardId } });
    if (reward.status === 'SENT') return;
    try {
      const signature = await this.solana.sendFromCustody({
        wallet: 'rewards',
        to: reward.wallet,
        token: 'SKR',
        amount: reward.amount,
        memo: `larea:reward:${reward.id}`,
      });
      await this.prisma.loyaltyReward.update({ where: { id: reward.id }, data: { status: 'SENT', signature, sentAt: new Date(), error: null, attempts: { increment: 1 } } });
      this.logger.log({ rewardId: reward.id, level: reward.level, amount: formatUnits(reward.amount) }, 'level reward sent');
    } catch (error) {
      const attempts = reward.attempts + 1;
      await this.prisma.loyaltyReward.update({
        where: { id: reward.id },
        data: { attempts, status: attempts >= MAX_ATTEMPTS ? 'FAILED' : 'PENDING', error: (error instanceof Error ? error.message : String(error)).slice(0, 500) },
      });
      this.logger.warn({ rewardId: reward.id, attempts, err: error }, 'level reward not sent');
    }
  }

  /** Retries rewards whose payout did not go through. */
  async sweep(): Promise<number> {
    const due = await this.prisma.loyaltyReward.findMany({ where: { status: 'PENDING' }, orderBy: { createdAt: 'asc' }, take: 50, select: { id: true } });
    for (const r of due) await this.send(r.id);
    return due.length;
  }

  async mine(userId: string): Promise<RewardView[]> {
    const rows = await this.prisma.loyaltyReward.findMany({
      where: { userId },
      include: { venue: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map((r) => ({
      id: r.id,
      venueId: r.venueId,
      venueName: r.venue.name,
      level: r.level,
      levelName: levelName(r.level),
      amount: formatUnits(r.amount),
      status: r.status,
      signature: r.signature,
      createdAt: r.createdAt.toISOString(),
    }));
  }
}
