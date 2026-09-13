import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { InjectEnv } from '../config/inject-env.js';
import type { Env } from '../config/env.js';
import { RedisService } from '../infra/redis/redis.service.js';
import { ListingsService } from './listings.service.js';
import { OffersService } from './offers.service.js';
import { OrdersService } from './orders.service.js';

const INTERVAL_MS = 15 * 60 * 1000;
const LOCK_TTL_MS = 14 * 60 * 1000;

export interface MarketSweepResult {
  offersExpired: number;
  listingsExpired: number;
  paymentTimeouts: number;
  autoRefunds: number;
}

/** Time-based marketplace transitions: offers and listings that ran out. */
@Injectable()
export class MarketScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MarketScheduler.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @InjectEnv() private readonly env: Env,
    private readonly redis: RedisService,
    private readonly listings: ListingsService,
    private readonly offers: OffersService,
    private readonly orders: OrdersService,
  ) {}

  onModuleInit(): void {
    if (this.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.runIfDue().catch((e) => this.logger.error(e)), INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async runIfDue(): Promise<MarketSweepResult | null> {
    if (!(await this.redis.acquireLock('lock:market-sweep', LOCK_TTL_MS))) return null;
    return this.run();
  }

  async run(now = new Date()): Promise<MarketSweepResult> {
    const orders = await this.orders.sweep(now);
    const result = { offersExpired: await this.offers.expireDue(now), listingsExpired: await this.listings.expireDue(now), ...orders };
    this.logger.log(result, 'market sweep complete');
    return result;
  }
}
