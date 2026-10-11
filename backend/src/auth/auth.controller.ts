import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RateLimit } from '../common/decorators/rate-limit.decorator.js';
import { RateLimitGuard } from '../common/guards/rate-limit.guard.js';
import { type AuthResult, AuthService } from './auth.service.js';
import { ForgotPasswordDto, LoginDto, LogoutDto, RefreshDto, RegisterDto, ResetPasswordDto } from './dto/auth.dto.js';

@ApiTags('auth')
@Controller('auth')
@UseGuards(RateLimitGuard)
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Create an account and sign in' })
  @RateLimit({ limit: 5, windowSec: 3600, by: 'ip' })
  register(@Body() dto: RegisterDto): Promise<AuthResult> {
    return this.auth.register(dto);
  }

  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Sign in with email and password' })
  @RateLimit({ limit: 10, windowSec: 60, by: 'ip' })
  login(@Body() dto: LoginDto): Promise<AuthResult> {
    return this.auth.login(dto);
  }

  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Exchange a refresh token for a new access token' })
  @RateLimit({ limit: 30, windowSec: 60, by: 'ip' })
  refresh(@Body() dto: RefreshDto): Promise<AuthResult> {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post('password/forgot')
  @HttpCode(204)
  @ApiOperation({ summary: 'Email a six-digit password reset code (same answer whether or not the account exists)' })
  @RateLimit({ limit: 10, windowSec: 3600, by: 'ip' })
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<void> {
    await this.auth.forgotPassword(dto.email);
  }

  @Post('password/reset')
  @HttpCode(200)
  @ApiOperation({ summary: 'Set a new password with the emailed code; signs out other devices and signs in' })
  @RateLimit({ limit: 20, windowSec: 3600, by: 'ip' })
  resetPassword(@Body() dto: ResetPasswordDto): Promise<AuthResult> {
    return this.auth.resetPassword(dto);
  }

  @Post('logout')
  @HttpCode(204)
  @ApiOperation({ summary: 'Revoke a refresh token' })
  async logout(@Body() dto: LogoutDto): Promise<void> {
    await this.auth.logout(dto.refreshToken);
  }
}
