import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { BlocksModule } from '../blocks/blocks.module.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { EnforcementModule } from '../enforcement/enforcement.module.js';
import { PresenceModule } from '../presence/presence.module.js';
import { SolanaModule } from '../solana/solana.module.js';
import { FakeGeocoder } from '../testing/fake-geocoder.js';
import { FakeStoreVerifier } from '../testing/fake-store-verifier.js';
import { GEOCODER, type Geocoder, NominatimGeocoder } from './geocoder.js';
import { AppleNotificationsController, PinsAdminController, PinsController } from './pins.controller.js';
import { PinsEnabledGuard } from './pins-enabled.guard.js';
import { PinsScheduler } from './pins.scheduler.js';
import { PinsService } from './pins.service.js';
import { RealStoreVerifier } from './real-store-verifier.js';
import { STORE_VERIFIER, type StoreVerifier } from './store-verifier.js';

@Module({
  imports: [AuthModule, PresenceModule, EnforcementModule, BlocksModule, SolanaModule],
  controllers: [PinsController, AppleNotificationsController, PinsAdminController],
  providers: [
    PinsService,
    PinsScheduler,
    PinsEnabledGuard,
    {
      provide: GEOCODER,
      inject: [ENV],
      useFactory: (env: Env): Geocoder => (env.NODE_ENV === 'test' ? new FakeGeocoder() : new NominatimGeocoder({ url: env.NOMINATIM_URL, contact: env.OVERPASS_CONTACT })),
    },
    {
      provide: STORE_VERIFIER,
      inject: [ENV],
      useFactory: (env: Env): StoreVerifier => (env.NODE_ENV === 'test' ? new FakeStoreVerifier() : new RealStoreVerifier(env)),
    },
  ],
  exports: [PinsService],
})
export class PinsModule {}
