import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export const DISPLAY_NAME_PATTERN = /^[\p{L}\p{N}_.][\p{L}\p{N}_. ]{1,22}[\p{L}\p{N}_.]$/u;
export const DISPLAY_NAME_RULE = 'Display name must be 3-24 characters: letters, numbers, spaces, underscores or dots.';

export class RegisterDto {
  @ApiProperty({ example: 'anna@example.com' })
  @IsEmail({}, { message: 'Please enter a valid email address.' })
  @MaxLength(254)
  email!: string;

  @ApiProperty({ minLength: 10, maxLength: 128 })
  @IsString()
  @MinLength(10, { message: 'Password must be at least 10 characters.' })
  @MaxLength(128, { message: 'Password must be at most 128 characters.' })
  password!: string;

  @ApiProperty({ example: 'anna_k', description: DISPLAY_NAME_RULE })
  @IsString()
  @Matches(DISPLAY_NAME_PATTERN, { message: DISPLAY_NAME_RULE })
  displayName!: string;

  @ApiPropertyOptional({ example: 'iPhone 15' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  deviceLabel?: string;
}

export class LoginDto {
  @ApiProperty({ example: 'anna@example.com' })
  @IsEmail({}, { message: 'Please enter a valid email address.' })
  email!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;

  @ApiPropertyOptional({ example: 'Pixel 8' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  deviceLabel?: string;
}

export class RefreshDto {
  @ApiProperty()
  @IsString()
  @MinLength(20)
  @MaxLength(128)
  refreshToken!: string;
}

export class LogoutDto extends RefreshDto {}
