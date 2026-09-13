import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { BlocksModule } from '../blocks/blocks.module.js';
import { EnforcementModule } from '../enforcement/enforcement.module.js';
import { MessagesModule } from '../messages/messages.module.js';
import { PresenceModule } from '../presence/presence.module.js';
import { VenuesModule } from '../venues/venues.module.js';
import { PollsController } from './polls.controller.js';
import { PollsService } from './polls.service.js';

@Module({
  imports: [AuthModule, MessagesModule, PresenceModule, VenuesModule, EnforcementModule, BlocksModule],
  controllers: [PollsController],
  providers: [PollsService],
})
export class PollsModule {}
