import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBase64, IsString, Matches } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { RateLimit } from '../common/decorators/rate-limit.decorator.js';
import { notFound } from '../common/errors.js';
import { AgeVerifiedGuard } from '../common/guards/age-verified.guard.js';
import { NotSuspendedGuard } from '../common/guards/not-suspended.guard.js';
import { RateLimitGuard } from '../common/guards/rate-limit.guard.js';
import type { UserSnapshot } from '../common/types.js';
import { InjectEnv } from '../config/inject-env.js';
import type { Env } from '../config/env.js';
import { LocationFixDto } from '../venues/dto/location-fix.dto.js';
import { SolanaEnabledGuard } from './solana-enabled.guard.js';
import { type CheckinResult, collectionMetadata, StampsService, type StampView, stampSvg, type VenueStampStatus } from './stamps.service.js';

export class SubmitStampDto {
  /** The wallet-signed transaction, base64. */
  @IsBase64()
  signedTransaction!: string;
}

export class ConfirmStampDto {
  /** Base58 transaction signature the wallet returned. */
  @IsString()
  @Matches(/^[1-9A-HJ-NP-Za-km-z]{64,90}$/)
  signature!: string;
}

@ApiTags('solana')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard, NotSuspendedGuard, AgeVerifiedGuard, SolanaEnabledGuard, RateLimitGuard)
export class StampsController {
  constructor(private readonly stamps: StampsService) {}

  @Post('venues/:id/checkin')
  @RateLimit({ limit: 10, windowSec: 60 })
  @ApiOperation({ summary: 'Check in: checks the location and returns a stamp mint for the wallet to sign' })
  checkin(@CurrentUser() user: UserSnapshot, @Param('id') venueId: string, @Body() fix: LocationFixDto): Promise<CheckinResult> {
    return this.stamps.checkin(user.id, venueId, fix);
  }

  @Get('venues/:id/stamp')
  @RateLimit({ limit: 60, windowSec: 60 })
  @ApiOperation({ summary: 'Whether a stamp here currently opens the chat, and the visit count' })
  venueStatus(@CurrentUser() user: UserSnapshot, @Param('id') venueId: string): Promise<VenueStampStatus> {
    return this.stamps.venueStatus(user.id, venueId);
  }

  @Post('solana/stamps/:id/submit')
  @RateLimit({ limit: 20, windowSec: 60 })
  @ApiOperation({ summary: 'Send a wallet-signed check-in transaction (when the wallet only signs)' })
  submit(@CurrentUser() user: UserSnapshot, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SubmitStampDto): Promise<StampView> {
    return this.stamps.submit(user.id, id, dto.signedTransaction);
  }

  @Post('solana/stamps/:id/confirm')
  @RateLimit({ limit: 60, windowSec: 60 })
  @ApiOperation({ summary: 'Report the signature of a check-in the wallet sent; returns the stamp state' })
  confirm(@CurrentUser() user: UserSnapshot, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ConfirmStampDto): Promise<StampView> {
    return this.stamps.confirm(user.id, id, dto.signature);
  }

  @Get('solana/stamps')
  @RateLimit({ limit: 30, windowSec: 60 })
  @ApiOperation({ summary: 'My confirmed stamps, cross-checked with the DAS index when configured' })
  list(@CurrentUser() user: UserSnapshot): Promise<{ stamps: StampView[]; dasChecked: boolean }> {
    return this.stamps.list(user.id);
  }
}

const COLLECTIONS: Record<string, 'stamps' | 'levels'> = { stamps: 'stamps', levels: 'levels' };

/** Public NFT metadata that the stamps' and collections' `uri` point at (wallets and explorers read it). */
@ApiTags('solana')
@Controller('solana/metadata')
export class MetadataController {
  constructor(
    @InjectEnv() private readonly env: Env,
    private readonly stamps: StampsService,
  ) {}

  private get base(): string {
    return (this.env.SOLANA_METADATA_URL ?? `${this.env.PUBLIC_URL}/solana/metadata`).replace(/\/$/, '');
  }

  @Get('stamps/:id.json')
  @Header('Cache-Control', 'public, max-age=300')
  stamp(@Param('id', ParseUUIDPipe) id: string): Promise<Record<string, unknown>> {
    return this.stamps.metadata(id);
  }

  @Get('stamps/:id.svg')
  @Header('Content-Type', 'image/svg+xml')
  @Header('Cache-Control', 'public, max-age=86400')
  stampImage(@Param('id', ParseUUIDPipe) id: string): Promise<string> {
    return this.stamps.image(id);
  }

  @Get(':kind.json')
  @Header('Cache-Control', 'public, max-age=3600')
  collection(@Param('kind') kind: string): Record<string, unknown> {
    const which = COLLECTIONS[kind];
    if (!which) throw notFound();
    return collectionMetadata(this.base, which);
  }

  @Get(':kind.svg')
  @Header('Content-Type', 'image/svg+xml')
  @Header('Cache-Control', 'public, max-age=86400')
  collectionImage(@Param('kind') kind: string): string {
    const which = COLLECTIONS[kind];
    if (!which) throw notFound();
    return stampSvg(which === 'stamps' ? 'Stamps' : 'Levels', 'Larea', 0).replace('VISIT 0', which === 'stamps' ? 'PROOF OF PRESENCE' : 'LOYALTY');
  }
}
