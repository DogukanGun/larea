import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import type { UserSnapshot } from '../common/types.js';
import { AdminService } from './admin.service.js';
import { IncidentsQueryDto, ReportsQueryDto, ResolveReportDto, SuspendUserDto, ResolveOrderDto } from './dto/admin.dto.js';

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('MODERATOR', 'ADMIN')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('reports')
  @ApiOperation({ summary: 'Reports queue' })
  reports(@Query() query: ReportsQueryDto) {
    return this.admin.listReports(query.status, query.limit);
  }

  @Get('incidents')
  @ApiOperation({ summary: 'Automatic incidents (severe content, strike thresholds, report thresholds)' })
  incidents(@Query() query: IncidentsQueryDto) {
    return this.admin.listIncidents(query.status, query.limit);
  }

  @Get('messages/:id')
  @ApiOperation({ summary: 'Full message record including original text and reports' })
  message(@Param('id') id: string) {
    return this.admin.getMessage(id);
  }

  @Post('reports/:id/resolve')
  @ApiOperation({ summary: 'Resolve a report: dismiss, hide, mute or suspend' })
  resolve(@CurrentUser() moderator: UserSnapshot, @Param('id') id: string, @Body() dto: ResolveReportDto) {
    return this.admin.resolveReport(id, moderator.id, dto);
  }

  @Post('orders/:id/resolve')
  @ApiOperation({ summary: 'Settle a disputed or stuck marketplace deal: release the payout or refund the buyer' })
  resolveOrder(@Param('id') id: string, @Body() dto: ResolveOrderDto) {
    return this.admin.resolveOrder(id, dto);
  }

  @Post('incidents/:id/resolve')
  @ApiOperation({ summary: 'Mark an incident as handled' })
  resolveIncident(@Param('id') id: string) {
    return this.admin.resolveIncident(id);
  }

  @Post('users/:id/suspend')
  @ApiOperation({ summary: 'Suspend an account' })
  suspend(@CurrentUser() moderator: UserSnapshot, @Param('id') id: string, @Body() dto: SuspendUserDto) {
    return this.admin.suspendUser(id, moderator.id, dto.reason);
  }

  @Post('users/:id/unsuspend')
  @ApiOperation({ summary: 'Lift a suspension' })
  unsuspend(@Param('id') id: string) {
    return this.admin.unsuspendUser(id);
  }
}
