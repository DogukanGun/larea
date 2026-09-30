import { type CanActivate, Injectable } from '@nestjs/common';
import { unavailable } from '../common/errors.js';
import { InjectEnv } from '../config/inject-env.js';
import type { Env } from '../config/env.js';

/** Solana features exist only where they are configured; the dApp Store app reads the same flag from /me. */
@Injectable()
export class SolanaEnabledGuard implements CanActivate {
  constructor(@InjectEnv() private readonly env: Env) {}

  canActivate(): boolean {
    if (!this.env.SOLANA_ENABLED) throw unavailable('SOLANA_DISABLED', 'Solana features are not available here yet.');
    return true;
  }
}
