import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PresenceModule } from '../presence/presence.module.js';
import { UsersModule } from '../users/users.module.js';
import { VenuesModule } from '../venues/venues.module.js';
import { RealtimeService } from './realtime.service.js';

@Module({
  imports: [AuthModule, UsersModule, PresenceModule, VenuesModule],
  providers: [RealtimeService],
})
export class RealtimeModule {}
