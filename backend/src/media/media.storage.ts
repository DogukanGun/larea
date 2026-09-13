import { access, mkdir, readFile, rename, rm, statfs, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import { InjectEnv } from '../config/inject-env.js';
import type { Env } from '../config/env.js';

export type MediaScope = 'public' | 'quarantine';
export type MediaVariant = 'main' | 'thumb';

/** Files on the uploads volume: `<dir>/public/<id>.jpg`, `<id>_thumb.jpg`; hidden content moves to `quarantine/`. */
@Injectable()
export class MediaStorage implements OnModuleInit {
  constructor(@InjectEnv() private readonly env: Env) {}

  async onModuleInit(): Promise<void> {
    await this.ensureDirs();
  }

  async ensureDirs(): Promise<void> {
    await mkdir(this.dir('public'), { recursive: true });
    await mkdir(this.dir('quarantine'), { recursive: true });
  }

  fileName(id: string, variant: MediaVariant): string {
    return variant === 'main' ? `${id}.jpg` : `${id}_thumb.jpg`;
  }

  private dir(scope: MediaScope): string {
    return join(this.env.MEDIA_DIR, scope);
  }

  private path(id: string, variant: MediaVariant, scope: MediaScope): string {
    return join(this.dir(scope), this.fileName(id, variant));
  }

  /** Writes both renditions atomically (temp file + rename) into the public directory. */
  async write(id: string, main: Buffer, thumb: Buffer): Promise<void> {
    await this.ensureDirs();
    for (const [variant, data] of [['main', main], ['thumb', thumb]] as const) {
      const target = this.path(id, variant, 'public');
      await writeFile(`${target}.tmp`, data);
      await rename(`${target}.tmp`, target);
    }
  }

  async read(id: string, variant: MediaVariant, scope: MediaScope = 'public'): Promise<Buffer | null> {
    try {
      return await readFile(this.path(id, variant, scope));
    } catch {
      return null;
    }
  }

  async exists(id: string, scope: MediaScope = 'public'): Promise<boolean> {
    try {
      await access(this.path(id, 'main', scope));
      return true;
    } catch {
      return false;
    }
  }

  /** Takes the files out of the public directory for moderator review. */
  async quarantine(id: string): Promise<void> {
    await this.ensureDirs();
    for (const variant of ['main', 'thumb'] as const) {
      try {
        await rename(this.path(id, variant, 'public'), this.path(id, variant, 'quarantine'));
      } catch {
        // already moved or never written
      }
    }
  }

  async remove(id: string): Promise<void> {
    for (const scope of ['public', 'quarantine'] as const) {
      for (const variant of ['main', 'thumb'] as const) {
        await rm(this.path(id, variant, scope), { force: true });
      }
    }
  }

  /** Free bytes on the volume, or null when the platform cannot tell. */
  async freeBytes(): Promise<number | null> {
    try {
      const stats = await statfs(this.env.MEDIA_DIR);
      return Number(stats.bavail) * Number(stats.bsize);
    } catch {
      return null;
    }
  }
}
