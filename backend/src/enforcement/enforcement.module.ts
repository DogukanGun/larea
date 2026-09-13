import { Module } from '@nestjs/common';
import { PresenceModule } from '../presence/presence.module.js';
import { UsersModule } from '../users/users.module.js';
import { EnforcementService } from './enforcement.service.js';

@Module({
  imports: [UsersModule, PresenceModule],
  providers: [EnforcementService],
  exports: [EnforcementService],
})
export class EnforcementModule {}
