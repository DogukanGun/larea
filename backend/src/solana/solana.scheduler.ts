import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { InjectEnv } from '../config/inject-env.js';
import type { Env } from '../config/env.js';
import { RedisService } from '../infra/redis/redis.service.js';
import { StampsService } from './stamps.service.js';
import { TipsService } from './tips.service.js';

const INTERVAL_MS = 30_000;
const LOCK_TTL_MS = 25_000;

/** Confirms check-ins and tips whose app never came back to report them, and fails the ones that ran out. */
@Injectable()
export class SolanaScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SolanaScheduler.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @InjectEnv() private readonly env: Env,
    private readonly redis: RedisService,
    private readonly stamps: StampsService,
    private readonly tips: TipsService,
  ) {}

  onModuleInit(): void {
    if (this.env.NODE_ENV === 'test' || !this.env.SOLANA_ENABLED) return;
    this.timer = setInterval(() => void this.runIfDue().catch((e) => this.logger.error(e)), INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async runIfDue(): Promise<void> {
    if (!(await this.redis.acquireLock('lock:solana-sweep', LOCK_TTL_MS))) return;
    const stamps = await this.stamps.sweep();
    const tips = await this.tips.sweep();
    if (stamps.confirmed || stamps.failed || tips.confirmed || tips.failed) this.logger.log({ stamps, tips }, 'solana sweep');
  }
}
