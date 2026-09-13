import { HttpStatus, Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AuthModule } from '../auth/auth.module.js';
import { AppError } from '../common/errors.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { MediaController } from './media.controller.js';
import { MediaService } from './media.service.js';
import { MediaStorage } from './media.storage.js';
import { IMAGE_MIME_TYPES } from './media.types.js';

@Module({
  imports: [
    AuthModule,
    MulterModule.registerAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        storage: memoryStorage(),
        limits: { fileSize: env.MEDIA_MAX_BYTES, files: 1, fields: 0 },
        fileFilter: (_req, file, cb) => {
          if ((IMAGE_MIME_TYPES as readonly string[]).includes(file.mimetype)) cb(null, true);
          else (cb as (error: Error) => void)(new AppError('UNSUPPORTED_MEDIA', 'Please choose a JPEG, PNG or WebP photo.', HttpStatus.UNSUPPORTED_MEDIA_TYPE));
        },
      }),
    }),
  ],
  controllers: [MediaController],
  providers: [MediaService, MediaStorage],
  exports: [MediaService, MediaStorage],
})
export class MediaModule {}
