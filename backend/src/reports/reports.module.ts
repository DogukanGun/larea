import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { MarketModule } from '../market/market.module.js';
import { MessagesModule } from '../messages/messages.module.js';
import { ListingReportsController, ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';

@Module({
  imports: [AuthModule, MessagesModule, MarketModule],
  controllers: [ReportsController, ListingReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
