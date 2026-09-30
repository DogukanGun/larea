import { Body, Controller, Delete, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBase64, IsString, Matches } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { RateLimit } from '../common/decorators/rate-limit.decorator.js';
import { NotSuspendedGuard } from '../common/guards/not-suspended.guard.js';
import { RateLimitGuard } from '../common/guards/rate-limit.guard.js';
import type { UserSnapshot } from '../common/types.js';
import type { SiwsChallenge } from './siws.js';
import { SolanaEnabledGuard } from './solana-enabled.guard.js';
import type { WalletBalances } from './solana.client.js';
import { WalletService, type WalletView } from './wallet.service.js';

export class LinkWalletDto {
  /** Base58 public key. */
  @IsString()
  @Matches(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/)
  address!: string;

  /** The signed Sign In With Solana message, base64. */
  @IsBase64()
  message!: string;

  /** Its ed25519 signature, base64. */
  @IsBase64()
  signature!: string;
}

@ApiTags('solana')
@ApiBearerAuth()
@Controller('solana/wallet')
@UseGuards(JwtAuthGuard, NotSuspendedGuard, SolanaEnabledGuard, RateLimitGuard)
export class WalletController {
  constructor(private readonly wallets: WalletService) {}

  @Post('challenge')
  @RateLimit({ limit: 10, windowSec: 600 })
  @ApiOperation({ summary: 'Sign In With Solana fields for the wallet to sign (one-time nonce, 5 min)' })
  challenge(@CurrentUser() user: UserSnapshot): Promise<SiwsChallenge> {
    return this.wallets.challenge(user.id);
  }

  @Post()
  @RateLimit({ limit: 10, windowSec: 600 })
  @ApiOperation({ summary: 'Link the wallet that signed the challenge' })
  link(@CurrentUser() user: UserSnapshot, @Body() dto: LinkWalletDto): Promise<WalletView> {
    return this.wallets.link(user.id, dto);
  }

  @Get()
  @RateLimit({ limit: 60, windowSec: 60 })
  @ApiOperation({ summary: 'The linked wallet and its SOL, USDC and SKR balances' })
  get(@CurrentUser() user: UserSnapshot): Promise<{ wallet: WalletView | null; balances: WalletBalances | null }> {
    return this.wallets.get(user.id);
  }

  @Delete()
  @HttpCode(204)
  @ApiOperation({ summary: 'Unlink the wallet (stamps stay in it)' })
  unlink(@CurrentUser() user: UserSnapshot): Promise<void> {
    return this.wallets.unlink(user.id);
  }
}
