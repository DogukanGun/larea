import { Module } from '@nestjs/common';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';

/** Fields that must never reach the logs: credentials and raw coordinates. */
export const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["stripe-signature"]',
  'req.body.code',
  'req.body.password',
  'req.body.refreshToken',
  'req.body.lat',
  'req.body.lng',
  'req.body.accuracy',
  'req.query.lat',
  'req.query.lng',
  'req.query.accuracy',
  'req.query.viewLat',
  'req.query.viewLng',
  'req.body.verification',
  'lat',
  'lng',
  'accuracy',
  'password',
  'refreshToken',
  'accessToken',
];

/** Query parameters that carry a position; their values are blanked in the logged URL too. */
const LOCATION_PARAMS = new Set(['lat', 'lng', 'accuracy', 'viewLat', 'viewLng']);

/** `/venues/nearby?lat=48.1&lng=11.5` → `/venues/nearby?lat=[redacted]&lng=[redacted]`. */
export function scrubUrl(url: string | undefined): string | undefined {
  if (!url || !url.includes('?')) return url;
  const [path, query] = url.split('?', 2);
  const parts = query.split('&').map((pair) => {
    const [key] = pair.split('=', 1);
    return LOCATION_PARAMS.has(decodeURIComponent(key)) ? `${key}=[redacted]` : pair;
  });
  return `${path}?${parts.join('&')}`;
}

@Module({
  imports: [
    PinoLoggerModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        pinoHttp: {
          level: env.NODE_ENV === 'test' ? 'silent' : env.NODE_ENV === 'production' ? 'info' : 'debug',
          redact: { paths: REDACTED_PATHS, censor: '[redacted]' },
          // The URL string repeats the query, so coordinates are blanked there as well.
          serializers: {
            req: (req: { url?: string }) => {
              req.url = scrubUrl(req.url);
              return req;
            },
          },
          autoLogging: { ignore: (req) => req.url === '/health' },
          transport: env.LOG_PRETTY ? { target: 'pino-pretty', options: { singleLine: true, colorize: true } } : undefined,
        },
      }),
    }),
  ],
})
export class LoggerModule {}
