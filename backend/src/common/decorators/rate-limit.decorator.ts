import { SetMetadata } from '@nestjs/common';

export interface RateLimitRule {
  /** Maximum number of requests within the window. */
  limit: number;
  /** Window length in seconds. */
  windowSec: number;
  /** Key the limit by authenticated user (default) or by client IP. */
  by?: 'user' | 'ip';
}

export const RATE_LIMIT_KEY = 'rate-limit';
export const RateLimit = (...rules: RateLimitRule[]) => SetMetadata(RATE_LIMIT_KEY, rules);
