import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { RateLimit } from '../common/decorators/rate-limit.decorator.js';
import { AgeVerifiedGuard } from '../common/guards/age-verified.guard.js';
import { NotSuspendedGuard } from '../common/guards/not-suspended.guard.js';
import { RateLimitGuard } from '../common/guards/rate-limit.guard.js';
import type { UserSnapshot } from '../common/types.js';
import { MarketEnabledGuard } from './market-enabled.guard.js';
import { type OrderView, OrdersService } from './orders.service.js';

export class ApproveOrderDto {
  @ApiProperty({ description: 'The six-digit handover code shown on the buyer\'s phone', example: '482913' })
  @IsString()
  @Matches(/^\s*\d{3}\s?\d{3}\s*$/, { message: 'Enter the six-digit code.' })
  code!: string;
}

@ApiTags('market')
@ApiBearerAuth()
@Controller('market/orders')
@UseGuards(JwtAuthGuard, NotSuspendedGuard, AgeVerifiedGuard, MarketEnabledGuard, RateLimitGuard)
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get(':id')
  @RateLimit({ limit: 120, windowSec: 60 })
  @ApiOperation({ summary: 'One deal (buyer or seller)' })
  get(@CurrentUser() user: UserSnapshot, @Param('id') id: string): Promise<OrderView> {
    return this.orders.get(user, id);
  }

  @Post(':id/checkout')
  @RateLimit({ limit: 5, windowSec: 600 })
  @ApiOperation({ summary: 'A Stripe Checkout page for the buyer to pay; reused while it is still open' })
  checkout(@CurrentUser() user: UserSnapshot, @Param('id') id: string): Promise<{ url: string; expiresAt: string }> {
    return this.orders.checkout(user, id);
  }

  @Post(':id/approve')
  @HttpCode(200)
  @RateLimit({ limit: 10, windowSec: 60 })
  @ApiOperation({ summary: 'Seller confirms the handover with the buyer\'s code; the payout is transferred' })
  approve(@CurrentUser() user: UserSnapshot, @Param('id') id: string, @Body() dto: ApproveOrderDto): Promise<OrderView> {
    return this.orders.approve(user, id, dto.code);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @RateLimit({ limit: 10, windowSec: 60 })
  @ApiOperation({ summary: 'Cancel an unpaid deal, or refund a paid one before the handover' })
  cancel(@CurrentUser() user: UserSnapshot, @Param('id') id: string): Promise<OrderView> {
    return this.orders.cancel(user, id);
  }
}
