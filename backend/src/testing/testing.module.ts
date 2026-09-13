import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { VerificationModule } from '../verification/verification.module.js';
import { TestingController } from './testing.controller.js';

/** Test-only endpoints; imported by AppModule only when NODE_ENV=test. */
@Module({
  imports: [AuthModule, VerificationModule],
  controllers: [TestingController],
})
export class TestingModule {}
