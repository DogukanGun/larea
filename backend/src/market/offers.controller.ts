import { Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { RateLimit } from '../common/decorators/rate-limit.decorator.js';
import { AgeVerifiedGuard } from '../common/guards/age-verified.guard.js';
import { NotSuspendedGuard } from '../common/guards/not-suspended.guard.js';
import { RateLimitGuard } from '../common/guards/rate-limit.guard.js';
import type { UserSnapshot } from '../common/types.js';
import { MarketEnabledGuard } from './market-enabled.guard.js';
import type { MarketConfigView, MarketMeView, OfferView } from './market.views.js';
import { OffersService } from './offers.service.js';

@ApiTags('market')
@ApiBearerAuth()
@Controller('market')
@UseGuards(JwtAuthGuard, NotSuspendedGuard, AgeVerifiedGuard, MarketEnabledGuard, RateLimitGuard)
export class OffersController {
  constructor(private readonly offers: OffersService) {}

  @Get('config')
  @RateLimit({ limit: 60, windowSec: 60 })
  @ApiOperation({ summary: 'Marketplace limits and switches' })
  config(): MarketConfigView {
    return this.offers.config();
  }

  @Get('me')
  @RateLimit({ limit: 60, windowSec: 60 })
  @ApiOperation({ summary: 'My listings, offers made and received, and orders' })
  me(@CurrentUser() user: UserSnapshot): Promise<MarketMeView> {
    return this.offers.me(user);
  }

  @Post('offers/:id/accept')
  @HttpCode(200)
  @RateLimit({ limit: 30, windowSec: 60 })
  @ApiOperation({ summary: 'Accept an offer on your listing (reserves the listing)' })
  accept(@CurrentUser() user: UserSnapshot, @Param('id') id: string): Promise<{ offer: OfferView }> {
    return this.offers.accept(user, id);
  }

  @Post('offers/:id/decline')
  @HttpCode(200)
  @RateLimit({ limit: 30, windowSec: 60 })
  @ApiOperation({ summary: 'Decline an offer on your listing' })
  decline(@CurrentUser() user: UserSnapshot, @Param('id') id: string): Promise<OfferView> {
    return this.offers.decline(user, id);
  }

  @Post('offers/:id/withdraw')
  @HttpCode(200)
  @RateLimit({ limit: 30, windowSec: 60 })
  @ApiOperation({ summary: 'Withdraw your own pending offer' })
  withdraw(@CurrentUser() user: UserSnapshot, @Param('id') id: string): Promise<OfferView> {
    return this.offers.withdraw(user, id);
  }
}
