import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsIn, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { RateLimit } from '../common/decorators/rate-limit.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { AgeVerifiedGuard } from '../common/guards/age-verified.guard.js';
import { NotSuspendedGuard } from '../common/guards/not-suspended.guard.js';
import { RateLimitGuard } from '../common/guards/rate-limit.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import type { UserSnapshot } from '../common/types.js';
import { type PerkView, PerksService } from './perks.service.js';
import { type RewardView, RewardsService } from './rewards.service.js';
import { SolanaEnabledGuard } from './solana-enabled.guard.js';

export class CreatePerkDto {
  @IsUUID()
  venueId!: string;

  @IsIn(['NOTICE', 'SKR_DROP'])
  kind!: 'NOTICE' | 'SKR_DROP';

  @IsString()
  @MinLength(3)
  @MaxLength(80)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  /** 1 Visitor, 2 Regular, 3 Local, 4 Legend. */
  @IsInt()
  @Min(1)
  @Max(4)
  minLevel!: number;

  /** SKR_DROP: whole SKR per holder, e.g. "5". */
  @IsOptional()
  @Matches(/^\d{1,6}(\.\d{1,6})?$/)
  amount?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100_000)
  maxClaims?: number;

  @IsOptional()
  @IsISO8601()
  startsAt?: string;

  @IsISO8601()
  endsAt!: string;
}

export class PerksQueryDto {
  @IsOptional()
  @IsUUID()
  venueId?: string;
}

/** Moderators run perks at places. */
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/perks')
@UseGuards(JwtAuthGuard, RolesGuard, SolanaEnabledGuard)
@Roles('MODERATOR', 'ADMIN')
export class PerksAdminController {
  constructor(private readonly perks: PerksService) {}

  @Post()
  @ApiOperation({ summary: 'Start a perk at a place for holders of a level (NOTICE, or an SKR_DROP claimed once per holder)' })
  create(@CurrentUser() moderator: UserSnapshot, @Body() dto: CreatePerkDto): Promise<PerkView> {
    return this.perks.create(moderator.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Perks, newest first, with claim counts' })
  list(@Query() query: PerksQueryDto): Promise<PerkView[]> {
    return this.perks.list(query.venueId);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'End a perk now' })
  cancel(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.perks.cancel(id);
  }
}

@ApiTags('solana')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard, NotSuspendedGuard, AgeVerifiedGuard, SolanaEnabledGuard, RateLimitGuard)
export class PerksController {
  constructor(
    private readonly perks: PerksService,
    private readonly rewards: RewardsService,
  ) {}

  @Get('venues/:id/perks')
  @RateLimit({ limit: 60, windowSec: 60 })
  @ApiOperation({ summary: 'Perks running at this place and whether my level reaches them' })
  async atVenue(@CurrentUser() user: UserSnapshot, @Param('id') venueId: string): Promise<{ perks: PerkView[] }> {
    return { perks: await this.perks.atVenue(user.id, venueId) };
  }

  @Post('solana/perks/:id/claim')
  @HttpCode(200)
  @RateLimit({ limit: 10, windowSec: 60 })
  @ApiOperation({ summary: 'Claim an SKR drop (once per holder); Larea sends the SKR' })
  claim(@CurrentUser() user: UserSnapshot, @Param('id', ParseUUIDPipe) id: string): Promise<PerkView & { signature: string | null }> {
    return this.perks.claim(user.id, id);
  }

  @Get('solana/rewards')
  @RateLimit({ limit: 30, windowSec: 60 })
  @ApiOperation({ summary: 'SKR I received for reaching levels' })
  async mine(@CurrentUser() user: UserSnapshot): Promise<{ rewards: RewardView[] }> {
    return { rewards: await this.rewards.mine(user.id) };
  }
}
