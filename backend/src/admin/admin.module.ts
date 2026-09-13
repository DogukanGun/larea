import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { EnforcementModule } from '../enforcement/enforcement.module.js';
import { MessagesModule } from '../messages/messages.module.js';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';

@Module({
  imports: [AuthModule, MessagesModule, EnforcementModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
