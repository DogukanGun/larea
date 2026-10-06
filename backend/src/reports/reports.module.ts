import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { MarketModule } from '../market/market.module.js';
import { MessagesModule } from '../messages/messages.module.js';
import { PinsModule } from '../pins/pins.module.js';
import { ListingReportsController, PinMessageReportsController, PinReportsController, ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';

@Module({
  imports: [AuthModule, MessagesModule, MarketModule, PinsModule],
  controllers: [ReportsController, ListingReportsController, PinReportsController, PinMessageReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
