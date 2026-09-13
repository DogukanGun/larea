import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { DiscoveryService } from './discovery/discovery.service.js';
import { FakeOverpassClient } from '../testing/fake-overpass.client.js';
import { HttpOverpassClient, OVERPASS_CLIENT, type OverpassClient } from './discovery/overpass.client.js';
import { VenuesController } from './venues.controller.js';
import { VenuesService } from './venues.service.js';

@Module({
  imports: [AuthModule],
  controllers: [VenuesController],
  providers: [
    VenuesService,
    DiscoveryService,
    {
      provide: OVERPASS_CLIENT,
      inject: [ENV],
      useFactory: (env: Env): OverpassClient =>
        env.NODE_ENV === 'test'
          ? new FakeOverpassClient()
          : new HttpOverpassClient({
              url: env.OVERPASS_URL,
              fallbackUrls: env.OVERPASS_FALLBACK_URLS.split(',').map((u) => u.trim()).filter(Boolean),
              contact: env.OVERPASS_CONTACT,
            }),
    },
  ],
  exports: [VenuesService, DiscoveryService, OVERPASS_CLIENT],
})
export class VenuesModule {}
