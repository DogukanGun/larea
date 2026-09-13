import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsEnum,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { ListingCategory, ListingKind } from '../../generated/prisma/enums.js';
import { MEDIA_ID_RE } from '../../media/media.types.js';
import { LocationFixDto } from '../../venues/dto/location-fix.dto.js';

export const TITLE_MIN = 3;
export const TITLE_MAX = 80;
export const DESCRIPTION_MAX = 1000;
export const NOTE_MAX = 300;

export class CreateListingDto extends LocationFixDto {
  @ApiProperty({ enum: ListingKind, description: 'OFFER = selling something, REQUEST = asking for paid help' })
  @IsEnum(ListingKind)
  kind!: ListingKind;

  @ApiProperty({ enum: ListingCategory })
  @IsEnum(ListingCategory)
  category!: ListingCategory;

  @ApiProperty({ minLength: TITLE_MIN, maxLength: TITLE_MAX, example: 'IKEA desk, good condition' })
  @IsString()
  @MinLength(TITLE_MIN, { message: `Titles need at least ${TITLE_MIN} characters.` })
  @MaxLength(TITLE_MAX, { message: `Titles can be at most ${TITLE_MAX} characters.` })
  title!: string;

  @ApiPropertyOptional({ maxLength: DESCRIPTION_MAX })
  @IsOptional()
  @IsString()
  @MaxLength(DESCRIPTION_MAX, { message: `Descriptions can be at most ${DESCRIPTION_MAX} characters.` })
  description?: string;

  @ApiProperty({ description: 'Asking price (OFFER) or budget (REQUEST) in cents', example: 2500 })
  @IsInt()
  @Min(1)
  priceCents!: number;

  @ApiPropertyOptional({ type: [String], description: 'Upload ids from POST /uploads, in display order' })
  @IsOptional()
  @ArrayMaxSize(10)
  @ArrayUnique()
  @Matches(MEDIA_ID_RE, { each: true, message: 'mediaIds must be upload ids.' })
  mediaIds?: string[];
}

export class UpdateListingDto {
  @ApiPropertyOptional({ minLength: TITLE_MIN, maxLength: TITLE_MAX })
  @IsOptional()
  @IsString()
  @MinLength(TITLE_MIN)
  @MaxLength(TITLE_MAX)
  title?: string;

  @ApiPropertyOptional({ maxLength: DESCRIPTION_MAX })
  @IsOptional()
  @IsString()
  @MaxLength(DESCRIPTION_MAX)
  description?: string;

  @ApiPropertyOptional({ enum: ListingCategory })
  @IsOptional()
  @IsEnum(ListingCategory)
  category?: ListingCategory;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  priceCents?: number;

  @ApiPropertyOptional({ type: [String], description: 'Replaces the photo list; ids already on the listing are kept, new upload ids are attached' })
  @IsOptional()
  @ArrayMaxSize(10)
  @ArrayUnique()
  @Matches(MEDIA_ID_RE, { each: true, message: 'mediaIds must be upload ids.' })
  mediaIds?: string[];
}

export const FEED_SORTS = ['distance', 'newest', 'price'] as const;
export type FeedSort = (typeof FEED_SORTS)[number];

export class ListingFeedQueryDto extends LocationFixDto {
  @ApiPropertyOptional({ description: 'Search radius in metres, capped at MARKET_RADIUS_M' })
  @IsOptional()
  @IsNumber()
  @Min(100)
  radiusM?: number;

  @ApiPropertyOptional({ enum: ListingKind })
  @IsOptional()
  @IsEnum(ListingKind)
  kind?: ListingKind;

  @ApiPropertyOptional({ enum: ListingCategory })
  @IsOptional()
  @IsEnum(ListingCategory)
  category?: ListingCategory;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  minPriceCents?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  maxPriceCents?: number;

  @ApiPropertyOptional({ maxLength: 60, description: 'Words to look for in the title' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  q?: string;

  @ApiPropertyOptional({ enum: FEED_SORTS, default: 'distance' })
  @IsOptional()
  @IsIn(FEED_SORTS)
  sort?: FeedSort;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  offset?: number;
}

const hasFix = (o: OptionalFixQueryDto) => o.lat !== undefined || o.lng !== undefined || o.accuracy !== undefined;

/** A fix is optional for reading a listing, but when given it must be complete. */
export class OptionalFixQueryDto {
  @ApiPropertyOptional()
  @ValidateIf(hasFix)
  @IsLatitude({ message: 'lat must be a valid latitude.' })
  lat?: number;

  @ApiPropertyOptional()
  @ValidateIf(hasFix)
  @IsLongitude({ message: 'lng must be a valid longitude.' })
  lng?: number;

  @ApiPropertyOptional()
  @ValidateIf(hasFix)
  @IsNumber()
  @Min(0)
  @Max(100_000)
  accuracy?: number;
}

export class CreateOfferDto extends LocationFixDto {
  @ApiProperty({ description: 'Proposed price in cents', example: 2000 })
  @IsInt()
  @Min(1)
  amountCents!: number;

  @ApiPropertyOptional({ maxLength: NOTE_MAX })
  @IsOptional()
  @IsString()
  @MaxLength(NOTE_MAX, { message: `Notes can be at most ${NOTE_MAX} characters.` })
  note?: string;
}
