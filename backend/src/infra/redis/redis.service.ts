import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { InjectEnv } from '../../config/inject-env.js';
import type { Env } from '../../config/env.js';

@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;
  private readonly extraConnections: Redis[] = [];

  constructor(@InjectEnv() private readonly env: Env) {
    this.client = new Redis(env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 2 });
  }

  /** Dedicated connection for pub/sub subscribers (a subscribed connection cannot run commands). */
  createSubscriber(): Redis {
    const sub = new Redis(this.env.REDIS_URL, { maxRetriesPerRequest: 2 });
    this.extraConnections.push(sub);
    return sub;
  }

  /** Acquire a short-lived lock. Returns true when this caller now holds the lock. */
  async acquireLock(key: string, ttlMs: number): Promise<boolean> {
    const result = await this.client.set(key, '1', 'PX', ttlMs, 'NX');
    return result === 'OK';
  }

  async ping(): Promise<boolean> {
    return (await this.client.ping()) === 'PONG';
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled([this.client.quit(), ...this.extraConnections.map((c) => c.quit())]);
  }
}
