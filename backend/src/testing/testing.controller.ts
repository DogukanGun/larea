import { Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { UserSnapshot } from '../common/types.js';
import { VerificationService, type VerificationStatusView } from '../verification/verification.service.js';

/** Shortcuts for automated tests. The module is only loaded when NODE_ENV=test. */
@ApiExcludeController()
@Controller('testing')
@UseGuards(JwtAuthGuard)
export class TestingController {
  constructor(private readonly verification: VerificationService) {}

  @Post('verify-age')
  @HttpCode(200)
  verifyAge(@CurrentUser() user: UserSnapshot): Promise<VerificationStatusView> {
    return this.verification.markVerifiedForTests(user.id);
  }
}
