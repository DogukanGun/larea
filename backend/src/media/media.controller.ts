import { Controller, HttpStatus, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { RateLimit } from '../common/decorators/rate-limit.decorator.js';
import { AppError } from '../common/errors.js';
import { AgeVerifiedGuard } from '../common/guards/age-verified.guard.js';
import { NotSuspendedGuard } from '../common/guards/not-suspended.guard.js';
import { RateLimitGuard } from '../common/guards/rate-limit.guard.js';
import type { UserSnapshot } from '../common/types.js';
import { MediaService } from './media.service.js';
import { type MediaView } from './media.types.js';

@ApiTags('media')
@ApiBearerAuth()
@Controller('uploads')
@UseGuards(JwtAuthGuard, NotSuspendedGuard, AgeVerifiedGuard, RateLimitGuard)
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post()
  @RateLimit({ limit: 10, windowSec: 60 }, { limit: 100, windowSec: 86_400 })
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } }, required: ['file'] } })
  @ApiOperation({ summary: 'Upload a photo (JPEG, PNG or WebP, max MEDIA_MAX_BYTES); returns the id to attach to a message or listing' })
  upload(@CurrentUser() user: UserSnapshot, @UploadedFile() file?: Express.Multer.File): Promise<MediaView> {
    if (!file) throw new AppError('VALIDATION', 'Attach the photo as the "file" field.', HttpStatus.BAD_REQUEST);
    return this.media.upload(user.id, { buffer: file.buffer, size: file.size });
  }
}
