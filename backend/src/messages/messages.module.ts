import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { BlocksModule } from '../blocks/blocks.module.js';
import { EnforcementModule } from '../enforcement/enforcement.module.js';
import { MediaModule } from '../media/media.module.js';
import { PresenceModule } from '../presence/presence.module.js';
import { VenuesModule } from '../venues/venues.module.js';
import { MessagesController } from './messages.controller.js';
import { MessagesService } from './messages.service.js';

@Module({
  imports: [AuthModule, PresenceModule, VenuesModule, EnforcementModule, BlocksModule, MediaModule],
  controllers: [MessagesController],
  providers: [MessagesService],
  exports: [MessagesService],
})
export class MessagesModule {}
