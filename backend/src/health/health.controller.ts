import { access, constants } from 'node:fs/promises';
import { join } from 'node:path';
import { Controller, Get, HttpCode, HttpStatus, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { Env } from '../config/env.js';
import { InjectEnv } from '../config/inject-env.js';
import { PrismaService } from '../infra/prisma/prisma.service.js';
import { RedisService } from '../infra/redis/redis.service.js';
import { MediaStorage } from '../media/media.storage.js';

export interface HealthView {
  status: 'ok' | 'degraded';
  db: boolean;
  redis: boolean;
  uploads: { writable: boolean; freeBytes: number | null };
  stripe: { lastWebhookAt: string | null; failedLastHour: number };
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    @InjectEnv() private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly storage: MediaStorage,
  ) {}

  @Get()
  @HttpCode(200)
  @ApiOperation({ summary: 'Liveness and dependency check (503 when degraded)' })
  async check(@Res({ passthrough: true }) res: Response): Promise<HealthView> {
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const [db, redis, writable, freeBytes, lastEvent, failedLastHour] = await Promise.all([
      this.prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
      this.redis.ping().catch(() => false),
      access(join(this.env.MEDIA_DIR, 'public'), constants.W_OK).then(() => true).catch(() => false),
      this.storage.freeBytes(),
      this.prisma.stripeEvent.findFirst({ orderBy: { receivedAt: 'desc' }, select: { receivedAt: true } }).catch(() => null),
      this.prisma.stripeEvent.count({ where: { receivedAt: { gte: hourAgo }, error: { not: null } } }).catch(() => 0),
    ]);
    const uploadsOk = writable && (freeBytes === null || freeBytes >= this.env.MEDIA_DISK_RESERVE_BYTES);
    const ok = db && redis && uploadsOk;
    res.status(ok ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    return {
      status: ok ? 'ok' : 'degraded',
      db,
      redis,
      uploads: { writable, freeBytes },
      stripe: { lastWebhookAt: lastEvent?.receivedAt.toISOString() ?? null, failedLastHour },
    };
  }
}
