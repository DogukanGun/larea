import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

/** `self` is the user's own 18+ confirmation, used where the platform returns no age range (e.g. Play Age Signals outside the US). */
export const AGE_PLATFORMS = ['apple', 'google', 'self'] as const;
export const AGE_DECLARATIONS = ['self', 'guardian', 'confirmed', 'unknown'] as const;

/** Result of the platform's age-range prompt (Apple Declared Age Range / Google Play Age Signals), or a self-declaration. */
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
