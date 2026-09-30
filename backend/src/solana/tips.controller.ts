import { Body, Controller, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsIn, IsString, IsUUID, Matches } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { RateLimit } from '../common/decorators/rate-limit.decorator.js';
import { AgeVerifiedGuard } from '../common/guards/age-verified.guard.js';
import { NotSuspendedGuard } from '../common/guards/not-suspended.guard.js';
import { RateLimitGuard } from '../common/guards/rate-limit.guard.js';
import type { UserSnapshot } from '../common/types.js';
import { SolanaEnabledGuard } from './solana-enabled.guard.js';
import { ConfirmStampDto, SubmitStampDto } from './stamps.controller.js';
import { type TipResult, TipsService, type TipView } from './tips.service.js';

export class CreateTipDto {
  @IsUUID()
  toUserId!: string;

  @IsIn(['USDC', 'SKR'])
  token!: 'USDC' | 'SKR';

  /** Whole tokens as a decimal string, e.g. "2.5" (at most 6 decimals). */
  @IsString()
  @Matches(/^\d{1,4}(\.\d{1,6})?$/)
  amount!: string;
}

@ApiTags('solana')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard, NotSuspendedGuard, AgeVerifiedGuard, SolanaEnabledGuard, RateLimitGuard)
export class TipsController {
  constructor(private readonly tips: TipsService) {}

  @Post('venues/:id/tips')
  @RateLimit({ limit: 10, windowSec: 60 }, { limit: 60, windowSec: 3600 })
  @ApiOperation({ summary: 'Tip someone in this chat in USDC or SKR; returns the transfer for the wallet to sign' })
  create(@CurrentUser() user: UserSnapshot, @Param('id') venueId: string, @Body() dto: CreateTipDto): Promise<TipResult> {
    return this.tips.create(user, venueId, dto);
  }

  @Post('solana/tips/:id/submit')
  @RateLimit({ limit: 30, windowSec: 60 })
  @ApiOperation({ summary: 'Send a wallet-signed tip (when the wallet only signs)' })
  submit(@CurrentUser() user: UserSnapshot, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SubmitStampDto): Promise<TipView> {
    return this.tips.submit(user.id, id, dto.signedTransaction);
  }

  @Post('solana/tips/:id/confirm')
  @RateLimit({ limit: 60, windowSec: 60 })
  @ApiOperation({ summary: 'Report the signature of a tip the wallet sent; returns its state' })
  confirm(@CurrentUser() user: UserSnapshot, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ConfirmStampDto): Promise<TipView> {
    return this.tips.confirm(user.id, id, dto.signature);
  }
}
