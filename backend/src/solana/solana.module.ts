import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { FakeSolanaClient } from '../testing/fake-solana.client.js';
import { DisabledSolanaClient } from './disabled-solana.client.js';
import { RealSolanaClient } from './real-solana.client.js';
import { SolanaEnabledGuard } from './solana-enabled.guard.js';
import { SOLANA_CLIENT, type SolanaClient } from './solana.client.js';
import { WalletController } from './wallet.controller.js';
import { WalletService } from './wallet.service.js';

@Module({
  imports: [AuthModule],
  controllers: [WalletController],
  providers: [
    WalletService,
    SolanaEnabledGuard,
    {
      provide: SOLANA_CLIENT,
      inject: [ENV],
      useFactory: (env: Env): SolanaClient =>
        env.NODE_ENV === 'test' ? new FakeSolanaClient() : env.SOLANA_ENABLED && env.SOLANA_AUTHORITY_SECRET ? new RealSolanaClient(env) : new DisabledSolanaClient(),
    },
  ],
  exports: [WalletService, SolanaEnabledGuard, SOLANA_CLIENT],
})
export class SolanaModule {}
