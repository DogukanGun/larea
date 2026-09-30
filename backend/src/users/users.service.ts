import { Injectable } from '@nestjs/common';
import { InjectEnv } from '../config/inject-env.js';
import { type Env, type Features, featuresOf } from '../config/env.js';
import { PrismaService } from '../infra/prisma/prisma.service.js';
import { RedisService } from '../infra/redis/redis.service.js';
import type { UserSnapshot } from '../common/types.js';
import { conflict } from '../common/errors.js';
import { assertDisplayNameAllowed } from '../auth/display-name.js';
import { ModerationService } from '../moderation/moderation.service.js';
import { RealtimeBus } from '../realtime/realtime.bus.js';
import { CLOSE_UNAUTHORIZED } from '../realtime/protocol.js';

const SNAPSHOT_TTL_SEC = 60;

export interface MeView {
  id: string;
  email: string;
  displayName: string;
  role: string;
  ageVerified: boolean;
  ageVerifiedAt: string | null;
  mutedUntil: string | null;
  suspendedAt: string | null;
  createdAt: string;
  activeMembership: { venueId: string; venueName: string; joinedAt: string } | null;
  /** What this backend supports; apps hide features that are off. */
  features: Features;
  /** The linked Solana wallet (dApp Store build), or null. */
  walletAddress: string | null;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectEnv() private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly bus: RealtimeBus,
    private readonly moderation: ModerationService,
  ) {}

  private snapshotKey(userId: string): string {
    return `user:snap:${userId}`;
  }

  /** Small cached view used by guards; null when the user does not exist or is deleted. */
  async getSnapshot(userId: string): Promise<UserSnapshot | null> {
    const cached = await this.redis.client.get(this.snapshotKey(userId));
    if (cached) return JSON.parse(cached) as UserSnapshot;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, displayName: true, ageVerifiedAt: true, mutedUntil: true, suspendedAt: true, deletedAt: true },
    });
    if (!user || user.deletedAt) return null;

    const now = Date.now();
    const snapshot: UserSnapshot = {
      id: user.id,
      role: user.role,
      displayName: user.displayName,
      ageVerified: user.ageVerifiedAt !== null,
      mutedUntil: user.mutedUntil && user.mutedUntil.getTime() > now ? user.mutedUntil.toISOString() : null,
      suspendedAt: user.suspendedAt?.toISOString() ?? null,
    };
    await this.redis.client.set(this.snapshotKey(userId), JSON.stringify(snapshot), 'EX', SNAPSHOT_TTL_SEC);
    return snapshot;
  }

  async invalidateSnapshot(userId: string): Promise<void> {
    await this.redis.client.del(this.snapshotKey(userId));
  }

  async me(userId: string): Promise<MeView | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        wallet: { select: { address: true } },
        memberships: {
          where: { status: 'ACTIVE' },
          include: { venue: { select: { id: true, name: true } } },
          take: 1,
        },
      },
    });
    if (!user || user.deletedAt) return null;
    const membership = user.memberships[0];
    const now = Date.now();
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      ageVerified: user.ageVerifiedAt !== null,
      ageVerifiedAt: user.ageVerifiedAt?.toISOString() ?? null,
      mutedUntil: user.mutedUntil && user.mutedUntil.getTime() > now ? user.mutedUntil.toISOString() : null,
      suspendedAt: user.suspendedAt?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
      activeMembership: membership
        ? { venueId: membership.venue.id, venueName: membership.venue.name, joinedAt: membership.joinedAt.toISOString() }
        : null,
      features: featuresOf(this.env),
      walletAddress: user.wallet?.address ?? null,
    };
  }

  async isDisplayNameTaken(displayName: string, excludeUserId?: string): Promise<boolean> {
    const existing = await this.prisma.user.findUnique({
      where: { displayNameLower: displayName.toLowerCase() },
      select: { id: true },
    });
    return existing !== null && existing.id !== excludeUserId;
  }

  async updateDisplayName(userId: string, displayName: string): Promise<MeView> {
    if (await this.isDisplayNameTaken(displayName, userId)) {
      throw conflict('DISPLAY_NAME_TAKEN', 'That display name is already in use.');
    }
    await assertDisplayNameAllowed(this.moderation, displayName);
    await this.prisma.user.update({
      where: { id: userId },
      data: { displayName, displayNameLower: displayName.toLowerCase() },
    });
    await this.invalidateSnapshot(userId);
    return (await this.me(userId))!;
  }

  /** Anonymises the account. Content stays pseudonymous for moderation history. */
  async deleteAccount(userId: string): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: {
          email: `deleted+${userId}@deleted.invalid`,
          displayName: 'Deleted user',
          displayNameLower: `deleted-${userId}`,
          passwordHash: '!',
          deletedAt: now,
        },
      }),
      this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } }),
      this.prisma.membership.updateMany({
        where: { userId, status: 'ACTIVE' },
        data: { status: 'ENDED', endReason: 'USER_LEFT', endedAt: now },
      }),
      // Marketplace: open listings and offers close; orders stay as the ledger requires.
      this.prisma.listing.updateMany({ where: { ownerId: userId, status: { in: ['ACTIVE', 'RESERVED'] } }, data: { status: 'CANCELLED' } }),
      this.prisma.offer.updateMany({ where: { offererId: userId, status: 'PENDING' }, data: { status: 'WITHDRAWN', respondedAt: now } }),
    ]);
    await this.invalidateSnapshot(userId);
    this.bus.closeUser(userId, CLOSE_UNAUTHORIZED, 'account deleted');
  }
}
