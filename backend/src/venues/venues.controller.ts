import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { AgeVerifiedGuard } from '../common/guards/age-verified.guard.js';
import { NotSuspendedGuard } from '../common/guards/not-suspended.guard.js';
import { NearbyQueryDto } from './dto/location-fix.dto.js';
import { type NearbyResult, type VenueView, VenuesService, toVenueView } from './venues.service.js';

@ApiTags('venues')
@ApiBearerAuth()
@Controller('venues')
@UseGuards(JwtAuthGuard, NotSuspendedGuard, AgeVerifiedGuard)
export class VenuesController {
  constructor(private readonly venues: VenuesService) {}

  @Get('nearby')
  @ApiOperation({ summary: 'Real places where the map is looking (discovered from OpenStreetMap), nearest to the phone first' })
  nearby(@Query() query: NearbyQueryDto): Promise<NearbyResult> {
    return this.venues.nearby(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Basic venue info' })
  async get(@Param('id') id: string): Promise<VenueView> {
    return toVenueView(await this.venues.getActive(id));
  }
}
