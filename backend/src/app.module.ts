import { Module } from '@nestjs/common';
import { AdminModule } from './admin/admin.module.js';
import { AuthModule } from './auth/auth.module.js';
import { CommonModule } from './common/common.module.js';
import { ConfigModule } from './config/config.module.js';
import { HealthModule } from './health/health.module.js';
import { LoggerModule } from './infra/logger/logger.module.js';
import { PrismaModule } from './infra/prisma/prisma.module.js';
import { RedisModule } from './infra/redis/redis.module.js';
import { UsersModule } from './users/users.module.js';
import { BlocksModule } from './blocks/blocks.module.js';
import { EnforcementModule } from './enforcement/enforcement.module.js';
import { MediaModule } from './media/media.module.js';
import { MessagesModule } from './messages/messages.module.js';
import { ModerationModule } from './moderation/moderation.module.js';
import { PresenceModule } from './presence/presence.module.js';
import { RealtimeCoreModule } from './realtime/realtime.core.module.js';
import { RealtimeModule } from './realtime/realtime.module.js';
import { ReportsModule } from './reports/reports.module.js';
import { RetentionModule } from './retention/retention.module.js';
import { TestingModule } from './testing/testing.module.js';
import { VenuesModule } from './venues/venues.module.js';
import { VerificationModule } from './verification/verification.module.js';

@Module({
  imports: [
    ConfigModule,
    LoggerModule,
    PrismaModule,
    RedisModule,
    RealtimeCoreModule,
    ModerationModule,
    CommonModule,
    AuthModule,
    UsersModule,
    VerificationModule,
    VenuesModule,
    PresenceModule,
    RealtimeModule,
    EnforcementModule,
    BlocksModule,
    MediaModule,
    MessagesModule,
    ReportsModule,
    AdminModule,
    RetentionModule,
    HealthModule,
    // Test doubles and shortcuts exist only in the test environment.
    ...(process.env.NODE_ENV === 'test' ? [TestingModule] : []),
  ],
})
export class AppModule {}
