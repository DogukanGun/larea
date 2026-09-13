import { join } from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Env } from './config/env.js';

/** Express-level setup shared by the real bootstrap and the e2e harness. */
export function configureApp(app: NestExpressApplication, env: Env): void {
  app.set('trust proxy', 1);
  // Uploaded images. In production Caddy serves the same volume and this route is never hit.
  app.useStaticAssets(join(env.MEDIA_DIR, 'public'), {
    prefix: '/media',
    index: false,
    dotfiles: 'ignore',
    immutable: true,
    maxAge: '365d',
    setHeaders: (res) => res.setHeader('X-Robots-Tag', 'noindex'),
  });
}
