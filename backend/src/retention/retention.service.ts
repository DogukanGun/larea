import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { InjectEnv } from '../config/inject-env.js';
import type { Env } from '../config/env.js';
import { PrismaService } from '../infra/prisma/prisma.service.js';
import { RedisService } from '../infra/redis/redis.service.js';
import { MediaService } from '../media/media.service.js';

const CHECK_INTERVAL_MS = 60 * 60 * 1000;
const LOCK_TTL_MS = 23 * 60 * 60 * 1000;

export interface RetentionResult {
  messages: number;
  flaggedMessages: number;
  memberships: number;
  violations: number;
  tokens: number;
  /** Media files removed: with purged messages, orphaned uploads, old records. */
  media: number;
}

/**
 * Chat is ephemeral. Ordinary messages are purged after MESSAGE_RETENTION_DAYS; messages
 * that were reported or tied to an incident stay for MODERATION_RECORD_RETENTION_DAYS.
 */
@Injectable()
export class RetentionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RetentionService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @InjectEnv() private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly media: MediaService,
  ) {}

  onModuleInit(): void {
    if (this.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.runIfDue().catch((e) => this.logger.error(e)), CHECK_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async runIfDue(): Promise<RetentionResult | null> {
    if (!(await this.redis.acquireLock('lock:retention', LOCK_TTL_MS))) return null;
    return this.run();
  }

  async run(now = new Date()): Promise<RetentionResult> {
    const days = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);
    const messageCutoff = days(this.env.MESSAGE_RETENTION_DAYS);
    const recordCutoff = days(this.env.MODERATION_RECORD_RETENTION_DAYS);

    const flaggedIds = (
      await this.prisma.incident.findMany({ where: { refId: { not: null } }, select: { refId: true } })
    ).map((i) => i.refId!);

    const ordinary = { createdAt: { lt: messageCutoff }, reports: { none: {} }, id: { notIn: flaggedIds } };
    const flagged = { createdAt: { lt: recordCutoff } };
    // Files first: once the rows are gone nothing points at them any more.
    const purgedMedia = (
      await this.prisma.message.findMany({ where: { OR: [ordinary, flagged], mediaId: { not: null } }, select: { mediaId: true } })
    ).map((m) => m.mediaId!);
    const messages = await this.prisma.message.deleteMany({ where: ordinary });
    const flaggedMessages = await this.prisma.message.deleteMany({ where: flagged });
    const media = (await this.media.purge(purgedMedia)) + (await this.media.sweepOrphans(now));
    const memberships = await this.prisma.membership.deleteMany({ where: { status: 'ENDED', endedAt: { lt: days(30) } } });
    const violations = await this.prisma.violation.deleteMany({ where: { createdAt: { lt: recordCutoff } } });
    const tokens = await this.prisma.refreshToken.deleteMany({
      where: { OR: [{ expiresAt: { lt: now } }, { revokedAt: { lt: days(7) } }] },
    });

    const result = {
      messages: messages.count,
      flaggedMessages: flaggedMessages.count,
      memberships: memberships.count,
      violations: violations.count,
      tokens: tokens.count,
      media,
    };
    this.logger.log(result, 'retention run complete');
    return result;
  }
}
