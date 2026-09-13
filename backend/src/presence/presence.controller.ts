import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { RateLimit } from '../common/decorators/rate-limit.decorator.js';
import { AgeVerifiedGuard } from '../common/guards/age-verified.guard.js';
import { NotSuspendedGuard } from '../common/guards/not-suspended.guard.js';
import { RateLimitGuard } from '../common/guards/rate-limit.guard.js';
import type { UserSnapshot } from '../common/types.js';
import { LocationFixDto } from '../venues/dto/location-fix.dto.js';
import { type JoinResult, type MembersResult, PresenceService } from './presence.service.js';

@ApiTags('venues')
@ApiBearerAuth()
@Controller('venues')
@UseGuards(JwtAuthGuard, NotSuspendedGuard, AgeVerifiedGuard, RateLimitGuard)
export class PresenceController {
  constructor(private readonly presence: PresenceService) {}

  @Post(':id/join')
  @RateLimit({ limit: 12, windowSec: 60 })
  @ApiOperation({ summary: 'Join the venue chat; requires a precise fix within the join radius' })
  join(@CurrentUser() user: UserSnapshot, @Param('id') venueId: string, @Body() fix: LocationFixDto): Promise<JoinResult> {
    return this.presence.join(user.id, venueId, fix);
  }

  @Get(':id/members')
  @RateLimit({ limit: 30, windowSec: 60 })
  @ApiOperation({ summary: 'Who is in the chat right now (members only; blocked pairs are hidden from each other)' })
  members(@CurrentUser() user: UserSnapshot, @Param('id') venueId: string): Promise<MembersResult> {
    return this.presence.members(user.id, venueId);
  }

  @Post(':id/leave')
  @HttpCode(204)
  @ApiOperation({ summary: 'Leave the venue chat' })
  async leave(@CurrentUser() user: UserSnapshot, @Param('id') venueId: string): Promise<void> {
    await this.presence.leave(user.id, venueId);
  }
}
