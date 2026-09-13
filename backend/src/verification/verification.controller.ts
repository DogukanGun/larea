import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { RateLimit } from '../common/decorators/rate-limit.decorator.js';
import { NotSuspendedGuard } from '../common/guards/not-suspended.guard.js';
import { RateLimitGuard } from '../common/guards/rate-limit.guard.js';
import type { UserSnapshot } from '../common/types.js';
import { PlatformAgeDto } from './dto/platform-age.dto.js';
import { type PlatformAgeResult, VerificationService, type VerificationStatusView } from './verification.service.js';

@ApiTags('verification')
@ApiBearerAuth()
@Controller('verification')
@UseGuards(JwtAuthGuard)
export class VerificationController {
  constructor(private readonly verification: VerificationService) {}

  @Post('platform')
  @HttpCode(200)
  @UseGuards(NotSuspendedGuard, RateLimitGuard)
  @RateLimit({ limit: 10, windowSec: 600 })
  @ApiOperation({ summary: "Record the operating system's age-range answer (Apple Declared Age Range / Play Age Signals)" })
  platform(@CurrentUser() user: UserSnapshot, @Body() dto: PlatformAgeDto): Promise<PlatformAgeResult> {
    return this.verification.recordPlatformSignal(user.id, dto);
  }

  @Get('status')
  @ApiOperation({ summary: 'Current age assurance state' })
  status(@CurrentUser() user: UserSnapshot): Promise<VerificationStatusView> {
    return this.verification.status(user.id);
  }
}
