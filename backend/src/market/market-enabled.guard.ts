import { type CanActivate, Injectable } from '@nestjs/common';
import { unavailable } from '../common/errors.js';
import { InjectEnv } from '../config/inject-env.js';
import { type Env, marketEnabled } from '../config/env.js';

/** The marketplace can be switched off per deployment; the apps read the same flag from /me. */
@Injectable()
export class MarketEnabledGuard implements CanActivate {
  constructor(@InjectEnv() private readonly env: Env) {}

  canActivate(): boolean {
    if (!marketEnabled(this.env)) throw unavailable('MARKET_DISABLED', 'The marketplace is not available here yet.');
    return true;
  }
}
