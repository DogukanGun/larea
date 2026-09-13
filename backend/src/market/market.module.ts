import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { BlocksModule } from '../blocks/blocks.module.js';
import { EnforcementModule } from '../enforcement/enforcement.module.js';
import { MediaModule } from '../media/media.module.js';
import { PresenceModule } from '../presence/presence.module.js';
import { ListingsController } from './listings.controller.js';
import { ListingsService } from './listings.service.js';
import { MarketEnabledGuard } from './market-enabled.guard.js';
import { MarketScheduler } from './market.scheduler.js';
import { OffersController } from './offers.controller.js';
import { OffersService } from './offers.service.js';

@Module({
  imports: [AuthModule, PresenceModule, BlocksModule, MediaModule, EnforcementModule],
  controllers: [ListingsController, OffersController],
  providers: [ListingsService, OffersService, MarketEnabledGuard, MarketScheduler],
  exports: [ListingsService, OffersService, MarketScheduler],
})
export class MarketModule {}
