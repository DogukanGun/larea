import { Module } from '@nestjs/common';
import { MarketModule } from '../market/market.module.js';
import { MediaModule } from '../media/media.module.js';
import { RetentionService } from './retention.service.js';

@Module({ imports: [MediaModule, MarketModule], providers: [RetentionService], exports: [RetentionService] })
export class RetentionModule {}
