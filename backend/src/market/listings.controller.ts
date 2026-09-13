import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { RateLimit } from '../common/decorators/rate-limit.decorator.js';
import { AgeVerifiedGuard } from '../common/guards/age-verified.guard.js';
import { NotSuspendedGuard } from '../common/guards/not-suspended.guard.js';
import { RateLimitGuard } from '../common/guards/rate-limit.guard.js';
import type { UserSnapshot } from '../common/types.js';
import { CreateListingDto, CreateOfferDto, ListingFeedQueryDto, OptionalFixQueryDto, UpdateListingDto } from './dto/market.dto.js';
import { ListingsService } from './listings.service.js';
import { MarketEnabledGuard } from './market-enabled.guard.js';
import type { ListingDetailView, ListingView, OfferView } from './market.views.js';
import { OffersService } from './offers.service.js';

@ApiTags('market')
@ApiBearerAuth()
@Controller('market/listings')
@UseGuards(JwtAuthGuard, NotSuspendedGuard, AgeVerifiedGuard, MarketEnabledGuard, RateLimitGuard)
export class ListingsController {
  constructor(
    private readonly listings: ListingsService,
    private readonly offers: OffersService,
  ) {}

  @Post()
  @RateLimit({ limit: 5, windowSec: 3600 }, { limit: 20, windowSec: 86_400 })
  @ApiOperation({ summary: 'Post a listing at your current location (shown to others approximately); text and photos are moderated' })
  create(@CurrentUser() user: UserSnapshot, @Body() dto: CreateListingDto): Promise<ListingDetailView> {
    return this.listings.create(user, dto);
  }

  @Get()
  @RateLimit({ limit: 60, windowSec: 60 })
  @ApiOperation({ summary: 'Listings within reach of the given fix, with filters' })
  feed(@CurrentUser() user: UserSnapshot, @Query() query: ListingFeedQueryDto): Promise<{ listings: ListingView[]; nextOffset: number | null; radiusM: number }> {
    return this.listings.feed(user, query);
  }

  @Get(':id')
  @RateLimit({ limit: 120, windowSec: 60 })
  @ApiOperation({ summary: 'One listing; needs a fix within MARKET_RADIUS_M unless you own it or made an offer' })
  get(@CurrentUser() user: UserSnapshot, @Param('id') id: string, @Query() query: OptionalFixQueryDto): Promise<ListingDetailView> {
    const fix = query.lat !== undefined && query.lng !== undefined ? { lat: query.lat, lng: query.lng } : null;
    return this.listings.get(user, id, fix);
  }

  @Patch(':id')
  @RateLimit({ limit: 30, windowSec: 3600 })
  @ApiOperation({ summary: 'Edit an active listing (re-moderated)' })
  update(@CurrentUser() user: UserSnapshot, @Param('id') id: string, @Body() dto: UpdateListingDto): Promise<ListingDetailView> {
    return this.listings.update(user, id, dto);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @RateLimit({ limit: 30, windowSec: 60 })
  @ApiOperation({ summary: 'Take an active listing down' })
  cancel(@CurrentUser() user: UserSnapshot, @Param('id') id: string): Promise<ListingView> {
    return this.listings.cancel(user, id);
  }

  @Post(':id/sold')
  @HttpCode(200)
  @RateLimit({ limit: 30, windowSec: 60 })
  @ApiOperation({ summary: 'Mark a listing as sold' })
  sold(@CurrentUser() user: UserSnapshot, @Param('id') id: string): Promise<ListingView> {
    return this.listings.markSold(user, id);
  }

  @Post(':id/offers')
  @RateLimit({ limit: 10, windowSec: 3600 })
  @ApiOperation({ summary: 'Propose a price (or offer to help) from within reach of the listing' })
  offer(@CurrentUser() user: UserSnapshot, @Param('id') id: string, @Body() dto: CreateOfferDto): Promise<OfferView> {
    return this.offers.create(user, id, dto);
  }
}
