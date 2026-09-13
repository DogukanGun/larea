import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { IncidentStatus, ReportStatus } from '../../generated/prisma/enums.js';

export enum ResolveAction {
  DISMISS = 'DISMISS',
  /** Hide the reported message or remove the reported listing. */
  HIDE_CONTENT = 'HIDE_CONTENT',
  /** Older name of HIDE_CONTENT, still accepted. */
  HIDE_MESSAGE = 'HIDE_MESSAGE',
  MUTE = 'MUTE',
  SUSPEND = 'SUSPEND',
}

export class ResolveReportDto {
  @ApiProperty({ enum: ResolveAction })
  @IsEnum(ResolveAction)
  action!: ResolveAction;

  @ApiPropertyOptional({ description: 'Mute length in hours (MUTE only)', default: 24 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24 * 30)
  durationHours?: number;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class SuspendUserDto {
  @ApiProperty({ maxLength: 500 })
  @IsString()
  @MaxLength(500)
  reason!: string;
}

export class ReportsQueryDto {
  @ApiPropertyOptional({ enum: ReportStatus, default: ReportStatus.OPEN })
  @IsOptional()
  @IsEnum(ReportStatus)
  status?: ReportStatus;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

export class IncidentsQueryDto {
  @ApiPropertyOptional({ enum: IncidentStatus, default: IncidentStatus.OPEN })
  @IsOptional()
  @IsEnum(IncidentStatus)
  status?: IncidentStatus;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
