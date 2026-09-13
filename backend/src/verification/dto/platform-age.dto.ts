import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export const AGE_PLATFORMS = ['apple', 'google'] as const;
export const AGE_DECLARATIONS = ['self', 'guardian', 'confirmed', 'unknown'] as const;

/** Result of the platform's age-range prompt (Apple Declared Age Range / Google Play Age Signals). */
export class PlatformAgeDto {
  @ApiProperty({ enum: AGE_PLATFORMS })
  @IsIn(AGE_PLATFORMS)
  platform!: (typeof AGE_PLATFORMS)[number];

  @ApiPropertyOptional({ description: 'Lower bound of the shared age range; absent when the user declined' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(150)
  lowerBound?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(150)
  upperBound?: number;

  @ApiProperty({ enum: AGE_DECLARATIONS, description: 'How the platform obtained the age range' })
  @IsIn(AGE_DECLARATIONS)
  declaration!: (typeof AGE_DECLARATIONS)[number];
}
