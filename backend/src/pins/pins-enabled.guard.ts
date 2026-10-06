import { type CanActivate, Injectable } from '@nestjs/common';
import { unavailable } from '../common/errors.js';
import { InjectEnv } from '../config/inject-env.js';
import type { Env } from '../config/env.js';

/** Pins can be switched off per server; the apps read the same flag from /me. */
@Injectable()
export class PinsEnabledGuard implements CanActivate {
  constructor(@InjectEnv() private readonly env: Env) {}

  canActivate(): boolean {
    if (!this.env.PINS_ENABLED) throw unavailable('PINS_DISABLED', 'Message pins are not available here yet.');
    return true;
  }
}
