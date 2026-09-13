import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectEnv } from '../../config/inject-env.js';
import type { Env } from '../../config/env.js';
import { RedisService } from '../../infra/redis/redis.service.js';
import { RATE_LIMIT_KEY, type RateLimitRule } from '../decorators/rate-limit.decorator.js';
import { tooMany } from '../errors.js';
import type { AuthenticatedRequest } from '../types.js';

/** Fixed-window limiter backed by Redis so limits hold across instances. */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly redis: RedisService,
    @InjectEnv() private readonly env: Env,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const rules = this.reflector.getAllAndOverride<RateLimitRule[] | undefined>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!rules?.length) return true;
    if (this.env.NODE_ENV === 'test' && process.env.RATE_LIMIT_IN_TESTS !== '1') return true;

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const route = `${context.getClass().name}.${context.getHandler().name}`;

    for (const rule of rules) {
      const subject = rule.by === 'ip' || !req.user ? `ip:${req.ip ?? 'unknown'}` : `user:${req.user.id}`;
      const window = Math.floor(Date.now() / 1000 / rule.windowSec);
      const key = `rl:${route}:${rule.windowSec}:${subject}:${window}`;
      const [[, count]] = (await this.redis.client
        .multi()
        .incr(key)
        .expire(key, rule.windowSec + 1)
        .exec()) as [[null, number], [null, number]];
      if (count > rule.limit) {
        throw tooMany("You're doing that too often. Please slow down.", { retryAfterSec: rule.windowSec });
      }
    }
    return true;
  }
}
