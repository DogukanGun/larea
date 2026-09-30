import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsBase64, IsOptional, IsString, Matches, ValidateIf } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { RateLimit } from '../common/decorators/rate-limit.decorator.js';
import { AgeVerifiedGuard } from '../common/guards/age-verified.guard.js';
import { NotSuspendedGuard } from '../common/guards/not-suspended.guard.js';
import { RateLimitGuard } from '../common/guards/rate-limit.guard.js';
import type { UserSnapshot } from '../common/types.js';
import { SolanaEnabledGuard } from '../solana/solana-enabled.guard.js';
import type { SolanaClient } from '../solana/solana.client.js';
import { MarketEnabledGuard } from './market-enabled.guard.js';
import { type OrderView, OrdersService } from './orders.service.js';

export class ApproveOrderDto {
  @ApiProperty({ description: 'The six-digit handover code shown on the buyer\'s phone', example: '482913' })
  @IsString()
  @Matches(/^\s*\d{3}\s?\d{3}\s*$/, { message: 'Enter the six-digit code.' })
  code!: string;
}

export class SolanaPaymentDto {
  /** The wallet-signed transfer, base64 (when the wallet only signs; Larea sends it). */
  @IsOptional()
  @IsBase64()
  signedTransaction?: string;

  /** Or the signature of the transfer the wallet sent itself. */
  @ValidateIf((o: SolanaPaymentDto) => !o.signedTransaction)
  @IsString()
  @Matches(/^[1-9A-HJ-NP-Za-km-z]{64,90}$/)
  signature?: string;
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

  @Post(':id/solana/pay')
  @UseGuards(SolanaEnabledGuard)
  @RateLimit({ limit: 10, windowSec: 600 })
  @ApiOperation({ summary: 'USDC deals: a transfer of the full amount from the buyer\'s wallet into Larea\'s escrow, for the wallet to sign' })
  solanaPay(@CurrentUser() user: UserSnapshot, @Param('id') id: string): Promise<{ transaction: string; cluster: SolanaClient['cluster']; order: OrderView }> {
    return this.orders.solanaPay(user, id);
  }

  @Post(':id/solana/submit')
  @HttpCode(200)
  @UseGuards(SolanaEnabledGuard)
  @RateLimit({ limit: 60, windowSec: 60 })
  @ApiOperation({ summary: 'USDC deals: report the signed payment (or its signature); returns the deal, PAID once it landed' })
  solanaSubmit(@CurrentUser() user: UserSnapshot, @Param('id') id: string, @Body() dto: SolanaPaymentDto): Promise<OrderView> {
    return this.orders.solanaSubmit(user, id, dto);
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
