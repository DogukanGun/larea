import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module.js';
import { RetentionService } from './retention.service.js';

@Module({ imports: [MediaModule], providers: [RetentionService], exports: [RetentionService] })
export class RetentionModule {}
