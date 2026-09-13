import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { BlocksModule } from '../blocks/blocks.module.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { EnforcementModule } from '../enforcement/enforcement.module.js';
import { MediaModule } from '../media/media.module.js';
import { PresenceModule } from '../presence/presence.module.js';
import { FakeStripeClient } from '../testing/fake-stripe.client.js';
import { ListingsController } from './listings.controller.js';
import { ListingsService } from './listings.service.js';
import { MarketEnabledGuard } from './market-enabled.guard.js';
import { MarketScheduler } from './market.scheduler.js';
import { OffersController } from './offers.controller.js';
import { OffersService } from './offers.service.js';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';
import { DisabledStripeClient } from './stripe/disabled-stripe.client.js';
import { RealStripeClient } from './stripe/real-stripe.client.js';
import { StripeConnectService } from './stripe/stripe-connect.service.js';
import { StripeWebhookService } from './stripe/stripe-webhook.service.js';
import { StripeConnectController, StripePublicController } from './stripe/stripe.controller.js';
import { STRIPE_CLIENT, type StripeClient } from './stripe/stripe.client.js';

@Module({
  imports: [AuthModule, PresenceModule, BlocksModule, MediaModule, EnforcementModule],
  controllers: [ListingsController, OffersController, OrdersController, StripeConnectController, StripePublicController],
  providers: [
    ListingsService,
    OffersService,
    OrdersService,
    StripeConnectService,
    StripeWebhookService,
    MarketEnabledGuard,
    MarketScheduler,
    {
      provide: STRIPE_CLIENT,
      inject: [ENV],
      useFactory: (env: Env): StripeClient =>
        env.NODE_ENV === 'test' ? new FakeStripeClient() : env.STRIPE_SECRET_KEY ? new RealStripeClient(env.STRIPE_SECRET_KEY) : new DisabledStripeClient(),
    },
  ],
  exports: [ListingsService, OffersService, OrdersService, MarketScheduler, STRIPE_CLIENT],
})
export class MarketModule {}
