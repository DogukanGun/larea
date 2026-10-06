import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsLatitude, IsLongitude, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateIf, ValidateNested } from 'class-validator';
import { MAX_MESSAGE_LENGTH } from '../../moderation/rules.js';
import { LocationFixDto, NearbyQueryDto } from '../../venues/dto/location-fix.dto.js';

export class PinTextDto {
  @ApiProperty({ maxLength: MAX_MESSAGE_LENGTH, example: 'Free concert at the fountain tonight, 8pm!' })
  @IsString()
  @MinLength(1, { message: 'Write a message to pin.' })
  @MaxLength(MAX_MESSAGE_LENGTH, { message: `Pinned messages can be at most ${MAX_MESSAGE_LENGTH} characters.` })
  text!: string;
}

export class QuotePinDto extends PinTextDto {
  @ApiProperty({ description: 'Where to pin the message', example: 48.1374 })
  @IsLatitude({ message: 'lat must be a valid latitude.' })
  lat!: number;

  @ApiProperty({ example: 11.5755 })
  @IsLongitude({ message: 'lng must be a valid longitude.' })
  lng!: number;

  @ApiProperty({ type: LocationFixDto, description: "The buyer's own position; it decides the price tier" })
  @ValidateNested()
  @Type(() => LocationFixDto)
  fix!: LocationFixDto;
}

export class PurchasePinDto {
  @ApiProperty({ enum: ['apple', 'google'] })
  @IsIn(['apple', 'google'])
  platform!: 'apple' | 'google';

  @ApiPropertyOptional({ description: "apple: StoreKit 2 Transaction.jwsRepresentation (appAccountToken = the pin's id)" })
  @ValidateIf((o: PurchasePinDto) => o.platform === 'apple')
  @IsString()
  @MaxLength(20_000)
  signedTransaction?: string;

  @ApiPropertyOptional({ description: 'google: the product id bought' })
  @ValidateIf((o: PurchasePinDto) => o.platform === 'google')
  @IsString()
  @MaxLength(200)
  productId?: string;

  @ApiPropertyOptional({ description: "google: Purchase.purchaseToken (obfuscatedProfileId = the pin's id)" })
  @ValidateIf((o: PurchasePinDto) => o.platform === 'google')
  @IsString()
  @MaxLength(4000)
  purchaseToken?: string;
}

export class SubmitPinPaymentDto {
  @ApiProperty({ description: 'The base64 transaction after the wallet signed it' })
  @IsString()
  @MaxLength(4000)
  signedTransaction!: string;
}

export class PinNearbyQueryDto extends NearbyQueryDto {}

/** Optional fix as query parameters (lat, lng, accuracy, mocked); the owner may leave it out. */
export class OptionalFixQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsLatitude()
  lat?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsLongitude()
  lng?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100_000)
  accuracy?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  mocked?: boolean;
}

export class PinHistoryQueryDto extends OptionalFixQueryDto {
  @ApiPropertyOptional({ description: 'Return messages newer than this message id (gap fill after reconnect)' })
  @IsOptional()
  @IsString()
  afterId?: string;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class SendPinMessageDto {
  @ApiProperty({ maxLength: MAX_MESSAGE_LENGTH })
  @IsString()
  @MinLength(1, { message: 'Message cannot be empty.' })
  @MaxLength(MAX_MESSAGE_LENGTH, { message: `Messages can be at most ${MAX_MESSAGE_LENGTH} characters.` })
  text!: string;

  @ApiProperty({ description: 'Client-generated idempotency key; resending with the same key returns the original result' })
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{8,64}$/, { message: 'clientKey must be 8-64 URL-safe characters.' })
  clientKey!: string;

  @ApiPropertyOptional({ type: LocationFixDto, description: 'Where the sender is; required unless they own the pin' })
  @IsOptional()
  @ValidateNested()
  @Type(() => LocationFixDto)
  fix?: LocationFixDto;
}

export class BanUserDto {
  @ApiProperty()
  @IsUUID()
  userId!: string;
}
