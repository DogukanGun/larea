import { Body, Controller, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { RateLimit } from '../common/decorators/rate-limit.decorator.js';
import { AgeVerifiedGuard } from '../common/guards/age-verified.guard.js';
import { NotSuspendedGuard } from '../common/guards/not-suspended.guard.js';
import { RateLimitGuard } from '../common/guards/rate-limit.guard.js';
import type { UserSnapshot } from '../common/types.js';
import { CreateReportDto } from './dto/create-report.dto.js';
import { type ReportResult, ReportsService } from './reports.service.js';

@ApiTags('reports')
@ApiBearerAuth()
@Controller('messages/:id/reports')
@UseGuards(JwtAuthGuard, NotSuspendedGuard, AgeVerifiedGuard, RateLimitGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Post()
  @HttpCode(200)
  @RateLimit({ limit: 20, windowSec: 3600 })
  @ApiOperation({ summary: 'Report a message for moderator review' })
  create(@CurrentUser() user: UserSnapshot, @Param('id') messageId: string, @Body() dto: CreateReportDto): Promise<ReportResult> {
    return this.reports.create(user.id, messageId, dto);
  }
}
