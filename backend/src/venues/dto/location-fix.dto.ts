import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsLatitude, IsLongitude, IsNumber, IsOptional, Max, Min, ValidateIf } from 'class-validator';

export class LocationFixDto {
  @ApiProperty({ example: 52.5219 })
  @IsLatitude({ message: 'lat must be a valid latitude.' })
  lat!: number;

  @ApiProperty({ example: 13.4132 })
  @IsLongitude({ message: 'lng must be a valid longitude.' })
  lng!: number;

  @ApiProperty({ description: 'Horizontal accuracy radius in metres (68% confidence)', example: 12 })
  @IsNumber()
  @Min(0)
  @Max(100_000)
  accuracy!: number;

  @ApiPropertyOptional({ description: 'True when the OS reports a mock/simulated location' })
  @IsOptional()
  @IsBoolean()
  mocked?: boolean;
}

const hasViewport = (o: NearbyQueryDto) => o.viewLat !== undefined || o.viewLng !== undefined || o.viewRadiusM !== undefined;

/**
 * The fix says where the phone is (distances, eligibility); the optional viewport says where the
 * map is looking (which places to return and discover). All three viewport fields go together.
 */
export class NearbyQueryDto extends LocationFixDto {
  @ApiPropertyOptional({ description: 'Latitude of the map viewport centre; defaults to the fix', example: 48.1374 })
  @ValidateIf(hasViewport)
  @IsLatitude({ message: 'viewLat must be a valid latitude.' })
  viewLat?: number;

  @ApiPropertyOptional({ description: 'Longitude of the map viewport centre; defaults to the fix', example: 11.5755 })
  @ValidateIf(hasViewport)
  @IsLongitude({ message: 'viewLng must be a valid longitude.' })
  viewLng?: number;

  @ApiPropertyOptional({
    description: 'Half the visible map width in metres; capped at DISCOVERY_MAX_RADIUS_M. Cafés are only included up to DISCOVERY_RADIUS_M.',
    example: 1500,
  })
  @ValidateIf(hasViewport)
  @IsNumber()
  @Min(1)
  @Max(1_000_000)
  viewRadiusM?: number;
}
