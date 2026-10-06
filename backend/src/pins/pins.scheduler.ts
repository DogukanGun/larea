import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { InjectEnv } from '../config/inject-env.js';
import type { Env } from '../config/env.js';
import { RedisService } from '../infra/redis/redis.service.js';
import { PinsService } from './pins.service.js';

const INTERVAL_MS = 60 * 1000;
const LOCK_TTL_MS = 55 * 1000;

/** Closes pins when their time is up (every minute), across instances via a Redis lock. */
@Injectable()
export class PinsScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PinsScheduler.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @InjectEnv() private readonly env: Env,
    private readonly redis: RedisService,
    private readonly pins: PinsService,
  ) {}

  onModuleInit(): void {
    if (this.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.runIfDue().catch((e) => this.logger.error(e)), INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async runIfDue(): Promise<void> {
    if (!(await this.redis.acquireLock('lock:pins-sweep', LOCK_TTL_MS))) return;
    const result = await this.pins.sweep();
    if (result.expired || result.purged || result.settled || result.refunded) this.logger.log(result, 'pin sweep complete');
  }
}
