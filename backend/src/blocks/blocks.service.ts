import { Injectable } from '@nestjs/common';
import { badRequest, notFound } from '../common/errors.js';
import { PrismaService } from '../infra/prisma/prisma.service.js';
import { RedisService } from '../infra/redis/redis.service.js';

const BLOCKSET_TTL_SEC = 300;

export interface BlockedUserView {
  id: string;
  displayName: string;
  blockedAt: string;
}

@Injectable()
export class BlocksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  private key(userId: string): string {
    return `blockset:${userId}`;
  }

  /** Users this user must not exchange messages with: the ones they blocked and the ones who blocked them. */
  async blockset(userId: string): Promise<string[]> {
    const cached = await this.redis.client.get(this.key(userId));
    if (cached) return JSON.parse(cached) as string[];
    const rows = await this.prisma.block.findMany({
      where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
      select: { blockerId: true, blockedId: true },
    });
    const ids = [...new Set(rows.map((r) => (r.blockerId === userId ? r.blockedId : r.blockerId)))];
    await this.redis.client.set(this.key(userId), JSON.stringify(ids), 'EX', BLOCKSET_TTL_SEC);
    return ids;
  }

  async block(blockerId: string, blockedId: string): Promise<void> {
    if (blockerId === blockedId) throw badRequest('CANNOT_BLOCK_SELF', "You can't block yourself.");
    const target = await this.prisma.user.findUnique({ where: { id: blockedId }, select: { id: true, deletedAt: true } });
    if (!target || target.deletedAt) throw notFound('User not found.');
    await this.prisma.block.upsert({
      where: { blockerId_blockedId: { blockerId, blockedId } },
      update: {},
      create: { blockerId, blockedId },
    });
    await this.redis.client.del(this.key(blockerId), this.key(blockedId));
  }

  async unblock(blockerId: string, blockedId: string): Promise<void> {
    await this.prisma.block.deleteMany({ where: { blockerId, blockedId } });
    await this.redis.client.del(this.key(blockerId), this.key(blockedId));
  }

  async list(blockerId: string): Promise<BlockedUserView[]> {
    const rows = await this.prisma.block.findMany({
      where: { blockerId },
      include: { blocked: { select: { id: true, displayName: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({ id: r.blocked.id, displayName: r.blocked.displayName, blockedAt: r.createdAt.toISOString() }));
  }
}
