import { randomBytes } from 'node:crypto';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { AppError, conflict, notFound } from '../common/errors.js';
import { InjectEnv } from '../config/inject-env.js';
import type { Env } from '../config/env.js';
import type { Media } from '../generated/prisma/client.js';
import { PrismaService } from '../infra/prisma/prisma.service.js';
import { UnsupportedImageError, moderationRendition, processImage } from './image-pipeline.js';
import { MediaStorage } from './media.storage.js';
import type { MediaView } from './media.types.js';

export type MediaSummary = Pick<Media, 'id' | 'status' | 'width' | 'height' | 'thumbWidth' | 'thumbHeight'>;

export const MEDIA_SUMMARY_SELECT = { id: true, status: true, width: true, height: true, thumbWidth: true, thumbHeight: true } as const;

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    @InjectEnv() private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly storage: MediaStorage,
  ) {}

  publicUrl(id: string, variant: 'main' | 'thumb' = 'main'): string {
    const base = (this.env.MEDIA_PUBLIC_URL ?? `${this.env.PUBLIC_URL.replace(/\/$/, '')}/media`).replace(/\/$/, '');
    return `${base}/${this.storage.fileName(id, variant)}`;
  }

  /** The wire shape; null unless the file is attached to visible content. */
  toView(media: MediaSummary | null | undefined): MediaView | null {
    if (!media || media.status !== 'ATTACHED') return null;
    return { id: media.id, url: this.publicUrl(media.id), thumbUrl: this.publicUrl(media.id, 'thumb'), width: media.width, height: media.height };
  }

  /** Re-encodes and stores an upload; the row starts as UPLOADED until a message or listing claims it. */
  async upload(ownerId: string, file: { buffer: Buffer; size: number }): Promise<MediaView> {
    const free = await this.storage.freeBytes();
    if (free !== null && free < this.env.MEDIA_DISK_RESERVE_BYTES) {
      this.logger.error({ free }, 'media.disk.low');
      throw new AppError('STORAGE_FULL', "We can't accept photos right now. Please try again later.", HttpStatus.INSUFFICIENT_STORAGE);
    }
    let processed;
    try {
      processed = await processImage(file.buffer, { maxPx: this.env.MEDIA_MAX_PX, thumbPx: this.env.MEDIA_THUMB_PX });
    } catch (err) {
      if (err instanceof UnsupportedImageError) {
        this.logger.warn({ reason: err.message }, 'media.upload.rejected');
        throw new AppError('UNSUPPORTED_MEDIA', 'Please choose a JPEG, PNG or WebP photo.', HttpStatus.UNSUPPORTED_MEDIA_TYPE);
      }
      throw err;
    }
    const id = randomBytes(16).toString('hex');
    await this.storage.write(id, processed.main, processed.thumb);
    const media = await this.prisma.media.create({
      data: {
        id,
        ownerId,
        width: processed.width,
        height: processed.height,
        bytes: processed.main.length,
        thumbWidth: processed.thumbWidth,
        thumbHeight: processed.thumbHeight,
        sha256: processed.sha256,
      },
    });
    return { id: media.id, url: this.publicUrl(id), thumbUrl: this.publicUrl(id, 'thumb'), width: media.width, height: media.height };
  }

  /** An owner's fresh upload, for moderation before it is attached. */
  async findUploaded(id: string, ownerId: string): Promise<Media> {
    const media = await this.prisma.media.findUnique({ where: { id } });
    if (!media || media.ownerId !== ownerId) throw notFound('That photo is no longer available.');
    if (media.status !== 'UPLOADED') throw conflict('MEDIA_ALREADY_USED', 'That photo was already used.');
    return media;
  }

  /** Marks an upload as attached; only the owner's still-unused upload qualifies. */
  async claim(id: string, ownerId: string): Promise<void> {
    const { count } = await this.prisma.media.updateMany({
      where: { id, ownerId, status: 'UPLOADED' },
      data: { status: 'ATTACHED', attachedAt: new Date() },
    });
    if (count === 1) return;
    const media = await this.prisma.media.findUnique({ where: { id }, select: { ownerId: true } });
    if (!media || media.ownerId !== ownerId) throw notFound('That photo is no longer available.');
    throw conflict('MEDIA_ALREADY_USED', 'That photo was already used.');
  }

  /** Blocked by moderation: the files go immediately, the row stays for the record. */
  async reject(id: string): Promise<void> {
    await this.storage.remove(id);
    await this.prisma.media.updateMany({ where: { id }, data: { status: 'REJECTED' } });
  }

  /** Hidden content: files leave the public directory but stay reviewable. */
  async quarantine(id: string): Promise<void> {
    await this.storage.quarantine(id);
    await this.prisma.media.updateMany({ where: { id }, data: { status: 'QUARANTINED' } });
  }

  /** The classifier's copy of a fresh upload. */
  async renditionForModeration(id: string): Promise<Buffer> {
    const main = await this.storage.read(id, 'main', 'public');
    if (!main) throw notFound('That photo is no longer available.');
    return moderationRendition(main);
  }

  /** For moderators: the file wherever it currently lives. */
  async readForReview(id: string, variant: 'main' | 'thumb'): Promise<Buffer | null> {
    return (await this.storage.read(id, variant, 'public')) ?? (await this.storage.read(id, variant, 'quarantine'));
  }

  /** Deletes files and rows for the given ids (parent content purged). */
  async purge(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    for (const id of ids) await this.storage.remove(id);
    const { count } = await this.prisma.media.deleteMany({ where: { id: { in: ids } } });
    return count;
  }

  /**
   * Uploads nobody attached within MEDIA_ORPHAN_TTL_MIN, attached media whose parent is gone,
   * and old rejected/quarantined records. A parent is a message or a listing; closed listings
   * purge their own photos (ListingsService.purgeClosed).
   */
  async sweepOrphans(now = new Date()): Promise<number> {
    const orphanCutoff = new Date(now.getTime() - this.env.MEDIA_ORPHAN_TTL_MIN * 60_000);
    const recordCutoff = new Date(now.getTime() - this.env.MODERATION_RECORD_RETENTION_DAYS * 86_400_000);
    const rows = await this.prisma.media.findMany({
      where: {
        message: null,
        listingImages: { none: {} },
        OR: [
          { status: 'UPLOADED', createdAt: { lt: orphanCutoff } },
          { status: 'ATTACHED' },
          { status: { in: ['REJECTED', 'QUARANTINED'] }, createdAt: { lt: recordCutoff } },
        ],
      },
      select: { id: true },
      take: 500,
    });
    return this.purge(rows.map((r) => r.id));
  }
}
